"""Validaciones por capa. Si algo falla: escribe data/finanzas/validacion_reporte.md, sale con código 1 y NO se publica.

bronze  columnas y volumen por año, rubros de la carátula dentro de la lista blanca, `valor` numérico
silver  esquemas pandera: un informe elegido por sociedad y año, variables conocidas, sin repetidos
gold    esquema pandera, rangos, volumen contra el año anterior y los criterios de la Fase 1
        (núcleo >= 95 %, identidad contable >= 99 %, conciliación de activos con `6cat-2gcs`, sin contacto)

Las advertencias (valores extremos que vienen de la fuente) se anotan en el reporte pero no bloquean la publicación.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pandera.pandas as pa

from pipelines.finanzas import analisis as an
from pipelines.finanzas import calidad as cal
from pipelines.finanzas import catalogos
from pipelines.finanzas import conceptos as cp
from pipelines.finanzas import indicadores as ind_
from pipelines.finanzas import senales as sen_
from pipelines.finanzas.config import CONJUNTOS, DATA
from pipelines.finanzas.transformar import OPINIONES

MIN_NUCLEO = 0.95
MIN_IDENTIDAD = 0.99
MAX_ERROR_ACTIVOS = 0.01  # mediana del error de activos contra `6cat-2gcs`
VARIACION_ANUAL = 0.35  # el número de sociedades no puede variar más de 35 % de un año al siguiente
MAX_NO_NUMERICO = 0.001  # fracción máxima de `valor` que no sea un número
LIMITE_PESOS = 1e15  # mil billones: por encima es casi seguro un error de unidades
COLUMNAS_BRONZE = ["codigo_instancia", "nit", "numero_radicado", "id_punto_entrada", "concepto", "periodo", "valor"]

VARIABLES = list(dict.fromkeys(r.variable for r in cp.RUBROS))
CUALQUIER_GRUPO = ["G1", "G2"]
TIPOS = ["individual", "separado"]

ESQUEMA_INFORMES = pa.DataFrameSchema({
    "anio": pa.Column(int, pa.Check.in_range(2016, 2100)),
    "nit": pa.Column(int, pa.Check.gt(0)),
    "codigo_instancia": pa.Column(int, pa.Check.gt(0)),
    "tipo_estado": pa.Column(str, pa.Check.isin(TIPOS)),
    "grupo": pa.Column(str, pa.Check.isin(CUALQUIER_GRUPO)),
    "seleccionado": pa.Column(bool),
}, coerce=True, checks=pa.Check(
    lambda df: ~df[df["seleccionado"]].duplicated(["nit", "anio"]).any(),
    error="más de un informe elegido para la misma sociedad y año"))

ESQUEMA_ESTADOS_LARGOS = pa.DataFrameSchema({
    "nit": pa.Column(int, pa.Check.gt(0)),
    "anio": pa.Column(int),
    "variable": pa.Column(str, pa.Check.isin(VARIABLES)),
    "valor_pesos": pa.Column(int, pa.Check.in_range(-LIMITE_PESOS, LIMITE_PESOS)),
}, coerce=True, unique=["nit", "anio", "variable"])

ESQUEMA_CARATULA = pa.DataFrameSchema({
    "nit": pa.Column(int, pa.Check.gt(0)),
    "anio": pa.Column(int),
    "razon_social": pa.Column(str, nullable=True),
    "ciiu_codigo": pa.Column(str, pa.Check.str_matches(r"^\d{4}$"), nullable=True),
    "opinion_revisor": pa.Column(str, pa.Check.isin(list(OPINIONES.values())), nullable=True),
}, coerce=True, unique=["nit", "anio"])


def esquema_estados(anios: list[int]) -> pa.DataFrameSchema:
    """Gold de estados: todo en pesos enteros; activos y pasivos no pueden ser negativos; ningún valor sobre 1e15."""
    columnas: dict[str, pa.Column] = {
        "nit": pa.Column(int, pa.Check.gt(0)),
        "anio": pa.Column(int, pa.Check.isin(anios)),
        "codigo_instancia": pa.Column(int, pa.Check.gt(0)),
        "grupo": pa.Column(str, pa.Check.isin(CUALQUIER_GRUPO)),
        "tipo_estado": pa.Column(str, pa.Check.isin(TIPOS)),
    }
    no_negativas = {"activo_total", "activo_corriente", "pasivo_total", "pasivo_corriente", "efectivo", "ppe",
                    "ingresos", "inventarios_corriente", "cxc_corriente", "cxp_comerciales"}
    for v in VARIABLES:
        checks = [pa.Check.in_range(-LIMITE_PESOS, LIMITE_PESOS)]
        if v in no_negativas:
            checks.append(pa.Check.ge(0))
        columnas[v] = pa.Column(float, checks, nullable=True)
    return pa.DataFrameSchema(columnas, coerce=True, unique=["nit", "anio"])


def _problemas_esquema(nombre: str, esquema: pa.DataFrameSchema, df: pd.DataFrame) -> list[str]:
    try:
        esquema.validate(df, lazy=True)
    except pa.errors.SchemaErrors as e:
        casos = e.failure_cases
        resumen = casos.groupby(["column", "check"], dropna=False).size().head(5).to_dict()
        return [f"Esquema {nombre}: {len(casos)} casos inválidos, p. ej. {resumen}"]
    return []


def anios_presentes(data: Path) -> list[int]:
    return sorted(int(p.stem.split("=")[1]) for p in (data / "bronze" / "puntos_entrada").glob("anio=*.parquet"))


def validar_bronze(data: Path, anios: list[int]) -> list[str]:
    problemas: list[str] = []
    con = duckdb.connect()
    for conjunto in CONJUNTOS:
        for a in anios:
            ruta = data / "bronze" / conjunto / f"anio={a}.parquet"
            if not ruta.exists():
                problemas.append(f"Bronze: falta {conjunto} {a}.")
                continue
            cols = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM '{ruta.as_posix()}'").fetchall()]
            if cols != COLUMNAS_BRONZE:
                problemas.append(f"Bronze {conjunto} {a}: columnas inesperadas {cols}.")
                continue
            n, malos = con.execute(f"""SELECT count(*), count(*) FILTER (WHERE TRY_CAST(valor AS DOUBLE) IS NULL)
                                       FROM '{ruta.as_posix()}'""").fetchone()
            if n == 0:
                problemas.append(f"Bronze {conjunto} {a}: sin filas.")
            elif conjunto != "caratula" and malos / n > MAX_NO_NUMERICO:
                problemas.append(f"Bronze {conjunto} {a}: {malos} de {n} valores no son numéricos.")
    permitidas = {cp.clave(v) for v in cp.CAMPOS_CARATULA.values()}
    for a in anios:
        ruta = data / "bronze" / "caratula" / f"anio={a}.parquet"
        if ruta.exists():
            fuera = [c for c in con.execute(f"SELECT DISTINCT concepto FROM '{ruta.as_posix()}'").df()["concepto"] if cp.clave(c) not in permitidas]
            if fuera:
                problemas.append(f"Bronze carátula {a}: rubros fuera de la lista blanca (¿datos de contacto?): {fuera[:3]}")
    return problemas


def validar_silver(data: Path) -> list[str]:
    silver = data / "silver"
    problemas = []
    problemas += _problemas_esquema("silver/informes", ESQUEMA_INFORMES, pd.read_parquet(silver / "informes.parquet"))
    problemas += _problemas_esquema("silver/estados_largos", ESQUEMA_ESTADOS_LARGOS, pd.read_parquet(silver / "estados_largos.parquet"))
    problemas += _problemas_esquema("silver/caratula", ESQUEMA_CARATULA, pd.read_parquet(silver / "caratula.parquet"))
    return problemas


def problemas_volumen(por_anio: pd.Series) -> list[str]:
    """De un año al siguiente no puede cambiar demasiado el número de sociedades."""
    problemas = []
    for ant, act in zip(por_anio.index[:-1], por_anio.index[1:], strict=True):
        variacion = por_anio[act] / por_anio[ant] - 1
        if abs(variacion) > VARIACION_ANUAL:
            problemas.append(f"Volumen: las sociedades pasan de {por_anio[ant]:,} en {ant} a {por_anio[act]:,} en {act} ({variacion:+.0%}).")
    return problemas


def validar_gold(data: Path, anios: list[int]) -> tuple[list[str], list[str], dict]:
    """(problemas, advertencias, métricas)."""
    gold, silver = data / "gold", data / "silver"
    problemas: list[str] = []
    avisos: list[str] = []
    e = pd.read_parquet(gold / "estados.parquet")
    ea = pd.read_parquet(gold / "empresas_anio.parquet")
    emp = pd.read_parquet(gold / "empresas.parquet")
    problemas += _problemas_esquema("gold/estados", esquema_estados(anios), e)

    problemas += problemas_volumen(e.groupby("anio").size())
    faltan = sorted(set(anios) - set(e["anio"].unique()))
    if faltan:
        problemas.append(f"Cobertura: no hay estados para los años {faltan}.")

    # Coherencia entre capas
    largos = pd.read_parquet(silver / "estados_largos.parquet", columns=["nit", "anio"]).drop_duplicates()
    if len(largos) != len(e):
        problemas.append(f"Conciliación silver/gold: {len(largos):,} sociedades-año con estados en silver y {len(e):,} en gold.")
    if emp["nit"].duplicated().any() or set(emp["nit"]) != set(ea["nit"]):
        problemas.append("Gold empresas: debe haber una fila por NIT y los mismos NIT que empresas_anio.")

    # Criterios de la Fase 1
    nuc, ide = cal.nucleo(e), cal.identidad(e)
    metricas: dict = {
        "sociedades_anio": len(e), "sociedades": len(emp),
        "nucleo_minimo": float(nuc["todas_las_8"].min()), "identidad_minima": float(ide["cumple"].min()),
    }
    for r in nuc.itertuples():
        if r.todas_las_8 < MIN_NUCLEO:
            problemas.append(f"Núcleo: solo el {r.todas_las_8:.1%} de los informes individuales de {r.anio} trae las 8 variables (mínimo {MIN_NUCLEO:.0%}).")
    for r in ide.itertuples():
        if r.cumple < MIN_IDENTIDAD:
            problemas.append(f"Identidad contable: solo el {r.cumple:.1%} de {r.anio} cumple activo = pasivo + patrimonio (mínimo {MIN_IDENTIDAD:.0%}).")
    if (data / "bronze" / "grandes" / "grandes.parquet").exists():
        m, _ = cal.conciliar(e, ea, data)
        con = cal.resumen_conciliacion(m).dropna(subset=["mediana_activos"])
        metricas["conciliacion_activos_mediana_max"] = float(con["mediana_activos"].max()) if len(con) else None
        for r in con.itertuples():
            if r.mediana_activos > MAX_ERROR_ACTIVOS:
                problemas.append(f"Conciliación con 6cat-2gcs: error mediano de activos {r.mediana_activos:.1%} en {r.anio} (máximo {MAX_ERROR_ACTIVOS:.0%}).")
    problemas += [f"Contacto: {x}" for x in cal.contacto(data)]

    # Advertencias: valores extremos que vienen de la fuente (un informe mal digitado)
    for v in ("ingresos", "costo_ventas", "flujo_inversion", "ingresos_financieros", "costos_financieros"):
        raros = e[(e[v].abs() > 10 * e["activo_total"].clip(lower=1)) & (e[v].abs() > 1e11)]
        if len(raros):
            avisos.append(f"{v}: {len(raros)} sociedades-año con un valor más de 10 veces su activo total (puede ser real en comercializadoras; si es un error, viene de la fuente).")
    return problemas, avisos, metricas


COLUMNAS_ALERTA = {"dimension", "codigo", "nombre", "anio", "muestra", "n_empresas", "p_media", "pct_perfil_alto", "n_perfil_alto", "umbral", "modelo",
                   "n_con_etiqueta", "n_eventos", "tasa_observada"}
MODELOS_ALERTA = {"altman", "logit", "lgbm"}
MIN_GRUPO_ALERTA = 30
MAX_SIN_PARES = 0.05  # desde 2020 (el CIIU de la carátula es propio) casi todas las sociedades deben tener pares
PRIMER_ANIO_CON_CIIU = 2020


def validar_fase3(data: Path, anios: list[int]) -> list[str]:
    """Tablas de indicadores, pares, señales y sector."""
    gold = data / "gold"
    problemas: list[str] = []
    faltan = [f for f in an.ARCHIVOS_FASE3 if not (gold / f).exists()]
    if faltan:
        return [f"Fase 3: faltan {faltan}; ¿corrió analisis.py?"]
    e = pd.read_parquet(gold / "estados.parquet", columns=["nit", "anio"])
    i = pd.read_parquet(gold / "indicadores.parquet")
    p = pd.read_parquet(gold / "pares.parquet")
    s = pd.read_parquet(gold / "senales.parquet")
    sa = pd.read_parquet(gold / "sector_anio.parquet")
    sr = pd.read_parquet(gold / "sector_resumen.parquet")

    for nombre, t in (("indicadores", i), ("pares", p), ("senales", s)):
        if len(t) != len(e) or t.duplicated(["nit", "anio"]).any() or not t[["nit", "anio"]].merge(e, how="outer", indicator=True)["_merge"].eq("both").all():
            problemas.append(f"Fase 3 {nombre}: debe tener exactamente una fila por sociedad y año de estados.")
    faltan_ipc = sorted(set(anios) - set(catalogos.ipc()["anio"]))
    if faltan_ipc:
        problemas.append(f"Fase 3: falta el IPC de {faltan_ipc} en pipelines/finanzas/referencia/ipc_anual.csv (ver catalogos.py).")

    valores = i[list(ind_.IDS)]
    if np.isinf(valores.to_numpy(dtype="float64", na_value=np.nan)).any():
        problemas.append("Fase 3 indicadores: hay valores infinitos (la división segura debía evitarlos).")
    for ident in ind_.IDS:
        incoherentes = int((i[ident].isna() != i[f"{ident}_motivo"].notna()).sum())
        if incoherentes:
            problemas.append(f"Fase 3 {ident}: {incoherentes} filas con valor y motivo (o sin ninguno de los dos).")
        desconocidos = set(i[f"{ident}_motivo"].dropna()) - set(ind_.MOTIVOS)
        if desconocidos:
            problemas.append(f"Fase 3 {ident}: motivos desconocidos {sorted(desconocidos)}.")

    pct = p[[c for c in p.columns if c.startswith("pct_")]]
    if len(pct.columns) != len(ind_.IDS) or not pct.stack().between(0, 100).all():
        problemas.append("Fase 3 pares: percentiles fuera de 0–100 o incompletos.")
    hay = p["nivel_pares"] != "ninguno"
    if (p.loc[hay, "n_pares"] < 15).any() or (p.loc[~hay, "n_pares"].notna()).any():
        problemas.append("Fase 3 pares: grupos con menos de 15 sociedades o tamaño sin grupo.")
    sin = p[p["anio"] >= PRIMER_ANIO_CON_CIIU].assign(sin=lambda t: t["nivel_pares"] == "ninguno").groupby("anio")["sin"].mean()
    for anio, fr in sin.items():
        if fr > MAX_SIN_PARES:
            problemas.append(f"Fase 3 pares: el {fr:.1%} de las sociedades de {anio} no tiene grupo de pares (máximo {MAX_SIN_PARES:.0%}).")

    marcas = s[list(sen_.IDS)]
    if not (s["n_senales"] == marcas.sum(axis=1)).all() or not s["n_senales"].between(0, len(sen_.IDS)).all():
        problemas.append("Fase 3 señales: `n_senales` no coincide con las señales verdaderas.")

    q = sa[["p05", "p25", "p50", "p75", "p95"]]
    if not ((q["p05"] <= q["p25"]) & (q["p25"] <= q["p50"]) & (q["p50"] <= q["p75"]) & (q["p75"] <= q["p95"])).all() or (sa["n"] < 15).any():
        problemas.append("Fase 3 sector: cuantiles desordenados o grupos con menos de 15 sociedades.")
    if (sr["n_empresas"] < 15).any() or sr["nombre"].isna().any():
        problemas.append("Fase 3 sector: grupos con menos de 15 sociedades o sin nombre CIIU.")

    for f in gold.glob("*.parquet"):  # el puntaje de Altman es individual y no se publica (decisión del autor)
        columnas = [c for c in pd.read_parquet(f).columns if "altman" in c.lower()]
        if columnas:
            problemas.append(f"Fase 3: {f.name} publica {columnas}; el Z'' de Altman es un puntaje individual de riesgo.")
    return problemas


def validar_fase4(data: Path, anios: list[int], artefactos: Path | None = None) -> list[str]:
    """La salida del modelo de alerta es solo agregada: sin NIT, sin puntajes por sociedad y sin grupos chicos."""
    artefactos = artefactos or Path(__file__).resolve().parents[2] / "models" / "finanzas" / "artifacts"
    ruta = data / "gold" / "alerta_agregada.parquet"
    if not ruta.exists():
        return ["Fase 4: falta alerta_agregada.parquet; ¿corrió models.finanzas.puntuar?"]
    a = pd.read_parquet(ruta)
    problemas: list[str] = []
    extra = set(a.columns) - COLUMNAS_ALERTA
    if extra:
        problemas.append(f"Fase 4: columnas no permitidas en la salida agregada {sorted(extra)} (ni NIT ni puntajes por sociedad).")
    if (a["n_empresas"] < MIN_GRUPO_ALERTA).any():
        problemas.append(f"Fase 4: hay grupos con menos de {MIN_GRUPO_ALERTA} sociedades.")
    if not a["pct_perfil_alto"].between(0, 1).all() or not a["p_media"].between(0, 1).all():
        problemas.append("Fase 4: proporciones o probabilidades fuera de 0–1.")
    if not set(a["modelo"]) <= MODELOS_ALERTA or a["modelo"].nunique() != 1 or a["umbral"].nunique() != 1:
        problemas.append("Fase 4: la salida debe venir de un solo modelo y un solo umbral.")
    total = a[a["dimension"] == "total"]
    if set(total["anio"]) != set(anios):
        problemas.append(f"Fase 4: el total nacional debe tener todos los años {anios}; tiene {sorted(set(total['anio']))}.")
    sel_ruta = artefactos / "seleccion.json"
    if not sel_ruta.exists():
        problemas.append("Fase 4: falta models/finanzas/artifacts/seleccion.json (el modelo versionado).")
    else:
        sel = json.loads(sel_ruta.read_text(encoding="utf-8"))
        if a["modelo"].iloc[0] != sel["publicado"] or abs(a["umbral"].iloc[0] - sel["umbral_perfil_alto"]) > 1e-12:
            problemas.append("Fase 4: la salida no coincide con el modelo y el umbral de seleccion.json.")
    return problemas


def validar(data: Path = DATA) -> tuple[list[str], list[str], dict]:
    anios = anios_presentes(data)
    problemas = validar_bronze(data, anios)
    if problemas:  # sin bronze completo no tiene sentido seguir
        return problemas, [], {}
    problemas += validar_silver(data)
    p, avisos, metricas = validar_gold(data, anios)
    problemas += p
    problemas += validar_fase3(data, anios)
    problemas += validar_fase4(data, anios)
    if os.environ.get("FORZAR_FALLO") == "1":
        problemas.append("Fallo forzado (FORZAR_FALLO=1) para probar el flujo de alerta.")
    return problemas, avisos, metricas


def main(data: Path = DATA) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    problemas, avisos, _ = validar(data)
    reporte = data / "validacion_reporte.md"
    if problemas:
        texto = "## Validaciones fallidas\n\n" + "\n".join(f"- {p}" for p in problemas) + "\n"
        if avisos:
            texto += "\n## Advertencias\n\n" + "\n".join(f"- {a}" for a in avisos) + "\n"
        reporte.write_text(texto, encoding="utf-8")
        print("VALIDACIÓN FALLIDA:\n" + "\n".join(f"- {p}" for p in problemas))
        return 1
    reporte.unlink(missing_ok=True)
    for a in avisos:
        print("Advertencia:", a)
    print("Validaciones OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
