"""Construye las series semanales completas (con ceros) para pronóstico."""
from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import duckdb
import pandas as pd

from pipelines.seguridad.config import DATA

SEMANAS_PROVISIONALES = 8  # el registro tardío aún no está medido (ver docs/decisiones.md, D5)


def ultima_semana_completa(data: Path = DATA) -> pd.Timestamp:
    """Lunes de la última semana que ya terminó antes del corte, menos las semanas provisionales."""
    corte = duckdb.connect().execute(f"select max(fecha) from '{(data / 'silver' / 'hechos.parquet').as_posix()}'").fetchone()[0]
    corte = pd.Timestamp(corte)
    lunes = corte - timedelta(days=corte.weekday())
    if corte.weekday() != 6:  # la semana del corte está incompleta
        lunes -= timedelta(days=7)
    return lunes - timedelta(weeks=SEMANAS_PROVISIONALES)


def semanal(data: Path = DATA) -> pd.DataFrame:
    """delito, cod_mpio, cod_dpto, ds (lunes), y (conteo) con ceros rellenados hasta la última semana confiable."""
    con = duckdb.connect()
    df = con.execute(f"""
        select s.delito, s.cod_mpio, m.cod_dpto, s.periodo::timestamp as ds, s.conteo::double as y
        from '{(data / 'gold' / 'hechos_semana_mpio.parquet').as_posix()}' s
        join '{(data / 'gold' / 'municipios.parquet').as_posix()}' m using (cod_mpio)""").df()
    fin = ultima_semana_completa(data)
    df = df[df["ds"] <= fin]
    semanas = pd.date_range(df["ds"].min(), fin, freq="7D")
    claves = df[["delito", "cod_mpio", "cod_dpto"]].drop_duplicates()
    grid = claves.merge(pd.DataFrame({"ds": semanas}), how="cross")
    return grid.merge(df, on=["delito", "cod_mpio", "cod_dpto", "ds"], how="left").fillna({"y": 0.0})
