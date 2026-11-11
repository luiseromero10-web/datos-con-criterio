"""Segmentación de series y variables de calendario (Colombia)."""
from __future__ import annotations

import holidays
import numpy as np
import pandas as pd

from models.seguridad.series import semanal

UMBRAL_MEDIA_MPIO = 2.0   # media semanal mínima para pronosticar a nivel municipal (ver docs/decisiones.md, D9)
H = 16                     # horizonte en semanas: 8 cubren las semanas provisionales y 8 llegan al futuro (ver D10)


def construir_series() -> pd.DataFrame:
    """unique_id, ds, y, delito, nivel ('mpio' | 'dpto'), cod. Municipal solo con volumen; departamental siempre."""
    d = semanal()
    mp = d.groupby(["delito", "cod_mpio"]).y.mean().rename("media").reset_index()
    con_volumen = mp[mp["media"] >= UMBRAL_MEDIA_MPIO][["delito", "cod_mpio"]]
    m = d.merge(con_volumen, on=["delito", "cod_mpio"])
    m = m.assign(nivel="mpio", cod=m["cod_mpio"])[["delito", "nivel", "cod", "ds", "y"]]
    dep = d.groupby(["delito", "cod_dpto", "ds"], as_index=False).y.sum()
    dep = dep.assign(nivel="dpto", cod=dep["cod_dpto"])[["delito", "nivel", "cod", "ds", "y"]]
    out = pd.concat([m, dep], ignore_index=True)
    out["unique_id"] = out["delito"] + "|" + out["nivel"] + "|" + out["cod"]
    return out.sort_values(["unique_id", "ds"]).reset_index(drop=True)


def calendario(semanas: pd.DatetimeIndex) -> pd.DataFrame:
    """Por semana (lunes): festivos de Colombia en la semana y quincenas (15 y fin de mes) que caen en ella."""
    anios = range(semanas.min().year, semanas.max().year + 2)
    fest = set(holidays.country_holidays("CO", years=list(anios)).keys())
    filas = []
    for ds in semanas:
        dias = pd.date_range(ds, periods=7)
        filas.append({
            "ds": ds,
            "festivos": sum(1 for x in dias if x.date() in fest),
            "quincena": int(any(x.day == 15 or x.is_month_end for x in dias)),
            "semana_anio": int(ds.isocalendar().week),
            "mes": ds.month,
        })
    return pd.DataFrame(filas)


def mase_escala(train: pd.DataFrame) -> pd.Series:
    """Escala de MASE por serie: error absoluto medio de la predicción 'igual a la semana anterior' en el entrenamiento."""
    return train.groupby("unique_id")["y"].apply(lambda s: float(np.abs(np.diff(s.values)).mean()) or 1.0)
