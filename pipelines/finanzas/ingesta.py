"""Ingesta a bronze: un Parquet por conjunto y año, solo los informes y rubros necesarios.

- Se consulta por `fecha_corte` (31-dic) y punto de entrada; nunca se baja el conjunto entero (44 M de filas).
- Solo el periodo actual y solo los rubros de `conceptos.py`; de la carátula, solo la lista blanca de campos
  (los datos de contacto no se piden nunca).
- Un corte cerrado no cambia: se descarga una vez y se vuelve a descargar solo si `rowsUpdatedAt` del conjunto cambió.
- No se usa `pipelines.common.socrata.fetch_all` porque guarda todas las filas en memoria (un año de balance son ~1 millón);
  aquí cada página se convierte y se libera.
"""
from __future__ import annotations

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pandas as pd
import requests
from dotenv import load_dotenv

from pipelines.common.socrata import BASE
from pipelines.finanzas import conceptos as cp
from pipelines.finanzas.config import ANIOS, CONJUNTOS, DATA, ESTADOS, GRANDES, HILOS, MIN_COMPLETITUD, PAGINA

load_dotenv()

COLUMNAS = "codigo_instancia,nit,numero_radicado,id_punto_entrada,concepto,periodo,valor"
META = DATA / "bronze" / "_meta.json"


def _cabeceras() -> dict[str, str]:
    token = os.environ.get("SOCRATA_APP_TOKEN")
    return {"X-App-Token": token} if token else {}


def paginas(dataset: str, where: str, select: str = COLUMNAS, reintentos: int = 6):
    """Genera las páginas (listas de dicts) de una consulta, ordenadas por :id."""
    offset = 0
    while True:
        params = {"$select": select, "$where": where, "$order": ":id", "$limit": PAGINA, "$offset": offset}
        for intento in range(reintentos):
            try:
                r = requests.get(f"{BASE}/{dataset}.json", params=params, headers=_cabeceras(), timeout=300)
                r.raise_for_status()
                break
            except requests.RequestException:
                if intento == reintentos - 1:
                    raise
                time.sleep(2**intento)
        pagina = r.json()
        if pagina:
            yield pagina
        if len(pagina) < PAGINA:
            return
        offset += PAGINA


def consulta_json(dataset: str, **params) -> list[dict]:
    p = {("$" + k): v for k, v in params.items()}
    for intento in range(6):
        try:
            r = requests.get(f"{BASE}/{dataset}.json", params=p, headers=_cabeceras(), timeout=300)
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if intento == 5:
                raise
            time.sleep(2**intento)
    return []


def actualizado(dataset: str) -> int:
    """Marca de tiempo (epoch) de la última actualización de los datos del conjunto."""
    r = requests.get(f"https://www.datos.gov.co/api/views/{dataset}.json", timeout=60)
    r.raise_for_status()
    return int(r.json().get("rowsUpdatedAt") or 0)


def clasificar_punto(nombre: str) -> tuple[str, str] | None:
    """(tipo, grupo) de un punto de entrada, o None si no es individual ni separado de Plenas/Pymes."""
    k = cp.clave(nombre)
    if "plenas" in k:
        grupo = "G1"
    elif "pymes" in k:
        grupo = "G2"
    else:
        return None
    if "individual" in k:
        return "individual", grupo
    if "separado" in k:
        return "separado", grupo
    return None


def descubrir_puntos(anio: int) -> pd.DataFrame:
    """Puntos de entrada (individual y separado, Plenas y Pymes) de la taxonomía principal del corte."""
    filas = consulta_json(
        CONJUNTOS["caratula"],
        select="id_punto_entrada, punto_entrada, id_taxonomia, count(distinct codigo_instancia) as informes",
        where=f"fecha_corte='{anio}-12-31' AND concepto='NIT'",
        group="id_punto_entrada, punto_entrada, id_taxonomia",
        limit=200,
    )
    df = pd.DataFrame(filas)
    df["informes"] = df["informes"].astype(int)
    # Hay informes sueltos de otras taxonomías con la fecha de corte equivocada: se ignoran.
    principal = df.groupby("id_taxonomia")["informes"].sum().idxmax()
    df = df[df["id_taxonomia"] == principal].copy()
    clases = df["punto_entrada"].map(clasificar_punto)
    df = df[clases.notna()].copy()
    df["tipo"] = [c[0] for c in clases[clases.notna()]]
    df["grupo"] = [c[1] for c in clases[clases.notna()]]
    df.insert(0, "anio", anio)
    return df.reset_index(drop=True)


def _filtro_conceptos(patrones: list[str]) -> str:
    return "(" + " OR ".join(f"concepto like '{p}'" for p in patrones) + ")"


def where_conjunto(conjunto: str, anio: int, ids: list[int]) -> str:
    lista = ",".join(str(i) for i in ids)
    base = f"fecha_corte='{anio}-12-31' AND id_punto_entrada in ({lista})"
    if conjunto == "caratula":
        return f"{base} AND {_filtro_conceptos(cp.patrones_soql_caratula())}"
    # Se descarta el periodo anterior y se deja el resto: según el año, el actual se escribe «Periodo Actual», «2016»,
    # «2016-dic-31» o (flujo de efectivo de 2016, defecto de la fuente) con el NIT. La regla exacta está en transformar.py.
    ant = anio - 1
    periodo = f"NOT (periodo='Periodo Anterior' OR periodo='{ant}' OR periodo like '{ant}-%')"
    return f"{base} AND {periodo} AND {_filtro_conceptos(cp.patrones_soql(conjunto))}"


def descargar(conjunto: str, anio: int, ids: list[int]) -> int:
    destino = DATA / "bronze" / conjunto / f"anio={anio}.parquet"
    destino.parent.mkdir(parents=True, exist_ok=True)
    partes = [pd.DataFrame(p) for p in paginas(CONJUNTOS[conjunto], where_conjunto(conjunto, anio, ids))]
    if partes:
        df = pd.concat(partes, ignore_index=True)
    else:
        df = pd.DataFrame(columns=COLUMNAS.split(","))
    df = df.astype(str)
    df.to_parquet(destino, index=False)
    return len(df)


def _leer_meta() -> dict:
    return json.loads(META.read_text(encoding="utf-8")) if META.exists() else {}


def _tarea(args: tuple[str, int, list[int]]) -> tuple[str, int, int, float]:
    conjunto, anio, ids = args
    t = time.time()
    n = descargar(conjunto, anio, ids)
    return conjunto, anio, n, time.time() - t


def grandes() -> int:
    """`6cat-2gcs` (10 000 empresas más grandes), solo para conciliar en la Fase 1."""
    destino = DATA / "bronze" / "grandes" / "grandes.parquet"
    destino.parent.mkdir(parents=True, exist_ok=True)
    cols = "nit,raz_n_social,supervisor,ciiu,macrosector,ingresos_operacionales,ganancia_p_rdida,total_activos,total_pasivos,total_patrimonio,a_o_de_corte"
    partes = [pd.DataFrame(p) for p in paginas(GRANDES, "a_o_de_corte > 0", select=cols)]
    df = pd.concat(partes, ignore_index=True).astype(str)
    df.to_parquet(destino, index=False)
    return len(df)


def corte_completo(puntos: pd.DataFrame, previos: pd.DataFrame | None) -> bool:
    """Un corte recién abierto trae pocos informes; entra cuando alcanza `MIN_COMPLETITUD` del corte anterior."""
    return previos is None or puntos["informes"].sum() >= MIN_COMPLETITUD * previos["informes"].sum()


def main(anios: list[int] | None = None, forzar: bool = False, solo: tuple[str, ...] | None = None) -> None:
    explicito = anios is not None
    anios = anios or list(ANIOS)
    meta = _leer_meta()
    nueva = {c: actualizado(CONJUNTOS[c]) for c in CONJUNTOS} | {"grandes": actualizado(GRANDES)}
    cambio = {c for c in nueva if meta.get(c) != nueva[c]}
    print("conjuntos con datos nuevos o sin descargar:", sorted(cambio) or "ninguno")

    puntos_dir = DATA / "bronze" / "puntos_entrada"
    puntos_dir.mkdir(parents=True, exist_ok=True)
    tareas: list[tuple[str, int, list[int]]] = []
    previos: pd.DataFrame | None = None
    for a in anios:
        ruta = puntos_dir / f"anio={a}.parquet"
        if forzar or not ruta.exists() or "caratula" in cambio:
            puntos = descubrir_puntos(a)
            if not explicito and not corte_completo(puntos, previos):
                print(f"  corte {a}: {puntos['informes'].sum()} informes, menos del {MIN_COMPLETITUD:.0%} del anterior; se omite por ahora")
                ruta.unlink(missing_ok=True)
                continue
            puntos.to_parquet(ruta, index=False)
        puntos = pd.read_parquet(ruta)
        previos = puntos
        ids = [int(i) for i in puntos["id_punto_entrada"]]
        for c in solo or ("caratula", *ESTADOS):
            if forzar or c in cambio or not (DATA / "bronze" / c / f"anio={a}.parquet").exists():
                tareas.append((c, a, ids))
    print(f"{len(tareas)} descargas pendientes")
    with ThreadPoolExecutor(HILOS) as ex:
        for conjunto, anio, n, seg in ex.map(_tarea, tareas):
            print(f"  {conjunto} {anio}: {n} filas en {seg:.0f} s", flush=True)
    if not solo and (forzar or "grandes" in cambio or not (DATA / "bronze" / "grandes" / "grandes.parquet").exists()):
        print("  grandes:", grandes(), "filas")

    # La marca de actualización solo se anota en una corrida completa: con años o conjuntos sueltos el resto sigue pendiente.
    if not explicito and not solo:
        meta.update(nueva)
        meta["descargado"] = datetime.now(UTC).isoformat(timespec="seconds")
        META.write_text(json.dumps(meta, indent=2), encoding="utf-8")


if __name__ == "__main__":
    args = sys.argv[1:]
    forzar = "--forzar" in args
    anios = [int(a) for a in args if a.isdigit()] or None
    solo = next((tuple(a.split("=")[1].split(",")) for a in args if a.startswith("--solo=")), None)
    main(anios, forzar, solo)
