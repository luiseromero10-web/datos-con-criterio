"""Validaciones de calidad. Si algo falla: escribe data/validacion_reporte.md, sale con cÃ³digo 1 y NO se publica."""
from __future__ import annotations

import itertools
import os
import sys
from datetime import date, timedelta

import duckdb
import pandera.pandas as pa

from pipelines.seguridad.config import ANIO_INICIO, DATA, DELITOS

CAIDA_MAXIMA = 0.5          # caÃ­da semana contra semana > 50 % = alerta
SEMANAS_REVISADAS = 8       # se vigilan las semanas recientes (las que cambian con cada carga)
SEMANAS_PROVISIONALES = 2   # las Ãºltimas semanas son parciales/tardÃ­as y no se comparan
MAX_DIAS_SIN_DATOS = 60     # frescura: el Ãºltimo hecho no puede tener mÃ¡s de 60 dÃ­as

ESQUEMA_SILVER = pa.DataFrameSchema({
    "delito": pa.Column(str, pa.Check.isin(list(DELITOS))),
    "fecha": pa.Column("datetime64[ns]", pa.Check.in_range(f"{ANIO_INICIO}-01-01", str(date.today()))),
    "cod_mpio": pa.Column(str, pa.Check.str_matches(r"^\d{5}$")),
    "cantidad": pa.Column(int, pa.Check.ge(0)),
}, coerce=True)

ESQUEMA_GOLD_MES = pa.DataFrameSchema({
    "periodo": pa.Column("datetime64[ns]"),
    "cod_mpio": pa.Column(str, pa.Check.str_matches(r"^\d{5}$")),
    "delito": pa.Column(str, pa.Check.isin(list(DELITOS))),
    "conteo": pa.Column(int, pa.Check.ge(0)),
    "tasa_100k": pa.Column(float, pa.Check.ge(0), nullable=False),
}, coerce=True, unique=["periodo", "cod_mpio", "delito"])


def validar(data: str | None = None, hoy: date | None = None) -> list[str]:
    """Devuelve la lista de problemas encontrados (vacÃ­a si todo estÃ¡ bien)."""
    base = DATA if data is None else __import__("pathlib").Path(data)
    hoy = hoy or date.today()
    problemas: list[str] = []
    con = duckdb.connect()

    silver = con.execute(f"select * from '{(base / 'silver' / 'hechos.parquet').as_posix()}'").df()
    gold = con.execute(f"select * from '{(base / 'gold' / 'hechos_mes_mpio.parquet').as_posix()}'").df()
    for nombre, esquema, df in (("silver", ESQUEMA_SILVER, silver), ("gold mensual", ESQUEMA_GOLD_MES, gold)):
        try:
            esquema.validate(df, lazy=True)
        except pa.errors.SchemaErrors as e:
            fallos = e.failure_cases.head(5).to_dict("records")
            problemas.append(f"Esquema {nombre}: {len(e.failure_cases)} casos invÃ¡lidos, p. ej. {fallos}")

    # Frescura
    ultimo = silver["fecha"].max().date()
    if (hoy - ultimo) > timedelta(days=MAX_DIAS_SIN_DATOS):
        problemas.append(f"Frescura: el Ãºltimo hecho es {ultimo} ({(hoy - ultimo).days} dÃ­as antes de hoy).")

    # Volumen: caÃ­da > 50 % semana contra semana, por delito, en las semanas recientes
    sem = con.execute(f"""
        select delito, periodo, sum(conteo) as n
        from '{(base / 'gold' / 'hechos_semana_mpio.parquet').as_posix()}' group by 1, 2 order by 1, 2""").df()
    for delito, g in sem.groupby("delito"):
        g = g.sort_values("periodo")["n"].tolist()
        g = g[: len(g) - SEMANAS_PROVISIONALES]
        ventana = g[-(SEMANAS_REVISADAS + 1):]
        for ant, act in itertools.pairwise(ventana):
            if ant > 0 and (ant - act) / ant > CAIDA_MAXIMA:
                problemas.append(f"Volumen: {delito} cae {100 * (ant - act) / ant:.0f} % de una semana a la siguiente ({ant} -> {act}).")

    # ConciliaciÃ³n silver vs gold
    s = int(silver[silver["cod_mpio"].isin(con.execute(f"select cod_mpio from '{(base / 'gold' / 'municipios.parquet').as_posix()}'").df()["cod_mpio"])]["cantidad"].sum())
    g = int(gold["conteo"].sum())
    if s != g:
        problemas.append(f"ConciliaciÃ³n: silver (con municipio vÃ¡lido) suma {s} y gold {g}.")

    pred = base / "gold" / "predicciones.parquet"
    if pred.exists():
        d = con.execute(f"select * from '{pred.as_posix()}'").df()
        if (d["p10"] < 0).any() or (d["p10"] > d["p50"]).any() or (d["p50"] > d["p90"]).any():
            problemas.append("Predicciones: intervalos inconsistentes (p10 > p50, p50 > p90 o valores negativos).")
        if d[["p10", "p50", "p90"]].isna().any().any():
            problemas.append("Predicciones: hay valores nulos.")
        if d.groupby(["nivel", "cod", "delito"]).size().nunique() != 1:
            problemas.append("Predicciones: no todas las series tienen el mismo número de semanas.")

    hot = base / "gold" / "hotspots.parquet"
    if hot.exists():
        h = con.execute(f"select * from '{hot.as_posix()}'").df()
        if not h["categoria"].isin(["emergente", "persistente", "en_disminucion", "frio", "sin_patron"]).all():
            problemas.append("Hotspots: categoría desconocida.")
        if not h[["z_ult", "q_ult", "z_prev", "q_prev"]].apply(lambda c: c.between(-50, 50) if c.name.startswith("z") else c.between(0, 1)).all().all():
            problemas.append("Hotspots: z o q fuera de rango.")
        if h.groupby("delito").size().nunique() != 1 or h.groupby("delito").size().iloc[0] < 1000:
            problemas.append("Hotspots: cobertura de municipios incompleta.")
    anom = base / "gold" / "anomalias.parquet"
    if anom.exists():
        a = con.execute(f"select * from '{anom.as_posix()}'").df()
        # el z se guarda con 2 decimales, por eso el margen de 0,01 sobre el umbral de 3
        if (a["z"].abs() < 2.99).any() or a[["valor", "esperado", "z"]].isna().any().any():
            problemas.append("Anomalías: filas bajo el umbral o con nulos.")
        if (a["z"].abs() > 100).any():
            problemas.append(f"Anomalías: puntajes inverosímiles (|z| máximo {a['z'].abs().max():.0f}); revisar la desviación de series casi todo ceros.")
        if len(a) > 0.1 * max(len(con.execute(f"select * from '{(base / 'gold' / 'hechos_semana_mpio.parquet').as_posix()}'").df()), 1):
            problemas.append("Anomalías: proporción excesiva de semanas atípicas.")

    if os.environ.get("FORZAR_FALLO") == "1":
        problemas.append("Fallo forzado (FORZAR_FALLO=1) para probar el flujo de alerta.")
    return problemas


def main() -> int:
    problemas = validar()
    reporte = DATA / "validacion_reporte.md"
    if problemas:
        reporte.write_text("## Validaciones fallidas\n\n" + "\n".join(f"- {p}" for p in problemas) + "\n", encoding="utf-8")
        print("VALIDACIÃ“N FALLIDA:\n" + "\n".join(f"- {p}" for p in problemas))
        return 1
    reporte.unlink(missing_ok=True)
    print("Validaciones OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
