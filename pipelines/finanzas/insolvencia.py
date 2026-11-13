"""Eventos de insolvencia (admisión a reorganización o a liquidación) reconstruidos uniendo los cortes de la base de la Supersociedades.

La base actual es una foto de procesos vigentes: los terminados desaparecen (comprobado en la Fase 0). Cada corte antiguo conserva
los que entonces estaban vivos, así que la unión de los cortes recupera procesos que ya no figuran. Dos limitaciones:
  - Solo los cortes de sept. y nov. de 2026 traen la fecha de admisión; los demás traen el año de apertura (en una reorganización
    «en ejecución» es el año del acuerdo, no el de la admisión).
  - Los cortes de 2020 a 2023 distinguen liquidación judicial, simplificada y por adjudicación; desde 2024 todo es «liquidación
    judicial en trámite». Para ser consistente, el evento es «admitida a reorganización o a cualquier liquidación».

Año de admisión estimado, de la más a la menos precisa (`precision`; exactitud medida contra las fechas exactas):
  exacta           trae fecha de admisión
  anio_apertura    proceso «en trámite» o liquidación: el año de apertura es el de la admisión (98,5 % exacto, 99,5 % a ±1 año)
  acuerdo_menos_1  reorganización «en ejecución»: el año de la columna es el del acuerdo; la admisión suele ser un año antes
                   (57–58 % exacto, 93–99 % a ±1 año; se probaron otras reglas con el punto medio entre cortes y fueron peores)
Los NIT no se publican: este archivo solo se usa para construir la etiqueta del modelo.
"""
from __future__ import annotations

import json
import re
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from pipelines.finanzas import conceptos as cp
from pipelines.finanzas.config import DATA

LISTA = Path(__file__).with_name("insolvencia_cortes.json")
CRUDO = DATA / "insolvencia_raw"


def fin_de_mes(corte: str) -> date:
    anio, mes = (int(x) for x in corte.split("-"))
    return date(anio + (mes == 12), mes % 12 + 1, 1) - timedelta(days=1)


def familia(proceso: object) -> str:
    k = cp.clave(proceso) if isinstance(proceso, str) else ""
    if "reorganizaci" in k:  # incluye la abreviada
        return "reorganizacion"
    if "liquidaci" in k:  # judicial, simplificada y por adjudicación
        return "liquidacion"
    return "otro"  # negociación de emergencia, validación judicial, filas con error


def en_ejecucion(proceso: object) -> bool:
    return "ejecuci" in cp.clave(proceso) if isinstance(proceso, str) else False


def anio_y_fecha(valor: object) -> tuple[float, pd.Timestamp]:
    """(año, fecha) de la columna de apertura, que según el corte trae un año, una fecha completa o un año que Excel guardó como fecha.

    Un número de serie de Excel pequeño (p. ej. 2025) se lee como 1905-07-xx: se recupera el número. Fuera de 1990–2100 se descarta.
    """
    if isinstance(valor, pd.Timestamp):
        if 1899 <= valor.year <= 1912:  # año guardado como serie de fecha
            anio = (valor - pd.Timestamp("1899-12-30")).days
            return (float(anio), pd.NaT) if 1990 <= anio <= 2100 else (float("nan"), pd.NaT)
        return (float(valor.year), valor) if 1990 <= valor.year <= 2100 else (float("nan"), pd.NaT)
    n = pd.to_numeric(valor, errors="coerce")
    return (float(n), pd.NaT) if pd.notna(n) and 1990 <= n <= 2100 else (float("nan"), pd.NaT)


def _columna(df: pd.DataFrame, *requeridos: str) -> str | None:
    for c in df.columns:
        k = cp.clave(c)
        if all(r in k for r in requeridos):
            return c
    return None


def leer_corte(ruta: Path, corte: str) -> pd.DataFrame:
    """(nit, familia, ejecucion, anio_ref, fecha_admision, corte) de un archivo, sea cual sea su formato."""
    d = pd.read_excel(ruta)
    d.columns = [str(c).strip() for c in d.columns]
    c_nit, c_proc = _columna(d, "nit"), _columna(d, "proceso")
    c_ref = _columna(d, "apertura")
    c_fecha = _columna(d, "fecha", "admision")
    nit = pd.to_numeric(d[c_nit], errors="coerce")
    ref = [anio_y_fecha(v) for v in d[c_ref]] if c_ref else [(float("nan"), pd.NaT)] * len(d)
    ejecucion = d[c_proc].map(en_ejecucion)
    fecha = pd.to_datetime(d[c_fecha], errors="coerce") if c_fecha else pd.Series(pd.NaT, index=d.index, dtype="datetime64[ns]")
    # Una fecha completa en la columna de apertura es la de admisión salvo en «ejecución» (allí sería la del acuerdo)
    completa = pd.Series([r[1] for r in ref], index=d.index, dtype="datetime64[ns]").where(~ejecucion)
    salida = pd.DataFrame({
        "nit": nit,
        "familia": d[c_proc].map(familia),
        "ejecucion": ejecucion,
        "anio_ref": [r[0] for r in ref],
        "fecha_admision": fecha.fillna(completa),
        "corte": corte,
    })
    return salida.dropna(subset=["nit"]).astype({"nit": "int64"})


def anio_estimado(grupo: pd.DataFrame) -> pd.Series:
    """Año de admisión (y su precisión) de un proceso (nit, familia) a partir de sus apariciones en los cortes."""
    g = grupo.sort_values("corte")
    primero = g.iloc[0]
    fechas = pd.to_datetime(g["fecha_admision"], errors="coerce").dropna()
    ref = g["anio_ref"].dropna()
    fecha = fechas.min() if len(fechas) else pd.NaT
    if len(fechas):
        anio, precision = fecha.year, "exacta"
    elif not len(ref):
        anio, precision = None, "sin_dato"
    elif primero["ejecucion"]:
        anio, precision = int(ref.iloc[0]) - 1, "acuerdo_menos_1"
    else:
        anio, precision = int(ref.iloc[0]), "anio_apertura"
    return pd.Series({"anio_admision": anio, "precision": precision, "primer_corte": primero["corte"], "fecha_admision": fecha})


def construir(crudo: Path = CRUDO) -> pd.DataFrame:
    """Un evento por (nit, familia): `anio_admision`, `precision`, `primer_corte`, `ultimo_corte`. Solo reorganización y liquidación."""
    cfg = json.loads(LISTA.read_text(encoding="utf-8"))
    cortes = sorted(c["corte"] for c in cfg["cortes"] if (crudo / c["archivo"]).exists())
    por_archivo = {c["corte"]: c["archivo"] for c in cfg["cortes"]}
    todo = pd.concat([leer_corte(crudo / por_archivo[c], c) for c in cortes], ignore_index=True)
    todo = todo[todo["familia"].isin(["reorganizacion", "liquidacion"])]
    # Un mismo NIT puede aparecer dos veces en un corte (dos admisiones): se conservan como filas del mismo evento
    est = todo.groupby(["nit", "familia"]).apply(anio_estimado, include_groups=False).reset_index()
    ultimo = todo.groupby(["nit", "familia"])["corte"].max().rename("ultimo_corte").reset_index()
    est = est.merge(ultimo, on=["nit", "familia"])
    est["anio_admision"] = pd.to_numeric(est["anio_admision"], errors="coerce").astype("Int64")
    return est.dropna(subset=["anio_admision"]).reset_index(drop=True)


def evaluar_regla(crudo: Path = CRUDO) -> pd.DataFrame:
    """Compara el año estimado sin la fecha con el año de la fecha exacta, en los procesos que la tienen (cortes de sept. y nov. 2026)."""
    cfg = json.loads(LISTA.read_text(encoding="utf-8"))
    cortes = sorted(c["corte"] for c in cfg["cortes"] if (crudo / c["archivo"]).exists())
    por_archivo = {c["corte"]: c["archivo"] for c in cfg["cortes"]}
    todo = pd.concat([leer_corte(crudo / por_archivo[c], c) for c in cortes], ignore_index=True)
    todo = todo[todo["familia"].isin(["reorganizacion", "liquidacion"])]
    todo["fecha_admision"] = pd.to_datetime(todo["fecha_admision"], errors="coerce")
    filas = []
    for (nit, fam), g in todo.groupby(["nit", "familia"]):
        exacta = g["fecha_admision"].dropna()
        if not len(exacta):
            continue
        e = anio_estimado(g.assign(fecha_admision=pd.NaT))  # se estima como si no se supiera la fecha
        if e["anio_admision"] is None or pd.isna(e["anio_admision"]):
            continue
        filas.append({"nit": nit, "familia": fam, "real": int(exacta.min().year), "estimado": int(e["anio_admision"]), "precision": e["precision"]})
    return pd.DataFrame(filas)


def sufijo_limpio(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


if __name__ == "__main__":
    import sys

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    eventos = construir()
    destino = DATA / "silver" / "eventos_insolvencia.parquet"
    destino.parent.mkdir(parents=True, exist_ok=True)
    eventos.to_parquet(destino, index=False)
    print(f"{len(eventos):,} eventos ({eventos['nit'].nunique():,} NIT) en {destino}; precisión: {eventos['precision'].value_counts().to_dict()}")
