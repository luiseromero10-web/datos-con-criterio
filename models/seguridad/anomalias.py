"""Semanas atípicas: residuo robusto frente a lo esperado, solo en semanas confiables.

Esperado = mediana de las 26 semanas anteriores (robusta a picos previos; se pronostica sin mirar el futuro).
Puntaje  = (valor - esperado) / sqrt(esperado + 1), estandarizado con la MAD de la propia serie.
Atípica  = |z| > 3. Series: las mismas del pronóstico (municipales con volumen y departamentales).
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from models.seguridad.prep import construir_series
from pipelines.seguridad.config import DATA

VENTANA = 26
UMBRAL_Z = 3.0
SEMANAS_MIN_SERIE = 52  # no se califica una serie con menos historia
SIGMA_MIN = 1.0  # el puntaje ya está escalado por sqrt(esperado+1): un conteo no es menos disperso que Poisson (sd ≈ 1). Sin piso, series casi todo ceros (MAD = 0) dan z de millones.


def calcular(s: pd.DataFrame) -> pd.DataFrame:
    """Devuelve todas las semanas con valor, esperado y z (las atípicas se filtran después)."""
    partes = []
    for uid, g in s.sort_values("ds").groupby("unique_id"):
        y = g["y"].to_numpy(float)
        if len(y) < SEMANAS_MIN_SERIE:
            continue
        esperado = pd.Series(y).shift(1).rolling(VENTANA, min_periods=VENTANA).median().to_numpy()
        score = (y - esperado) / np.sqrt(esperado + 1.0)
        validos = score[~np.isnan(score)]
        mad = np.median(np.abs(validos - np.median(validos)))
        sigma = max(1.4826 * mad, SIGMA_MIN)
        z = score / sigma
        partes.append(pd.DataFrame({"unique_id": uid, "periodo": g["ds"].to_numpy(), "valor": y, "esperado": esperado, "z": z}))
    if not partes:
        return pd.DataFrame(columns=["unique_id", "periodo", "valor", "esperado", "z"])
    return pd.concat(partes, ignore_index=True).dropna(subset=["z"])


def main() -> int:
    s = construir_series()
    t = calcular(s)
    a = t[t["z"].abs() > UMBRAL_Z].copy()
    p = a["unique_id"].str.split("|", expand=True)
    a["delito"], a["nivel"], a["cod"] = p[0], p[1], p[2]
    a["sentido"] = np.where(a["z"] > 0, "alta", "baja")
    a["esperado"], a["z"] = a["esperado"].round(2), a["z"].round(2)
    out = a[["periodo", "nivel", "cod", "delito", "valor", "esperado", "z", "sentido"]].sort_values(["periodo", "delito"])
    (DATA / "gold").mkdir(parents=True, exist_ok=True)
    out.to_parquet(DATA / "gold" / "anomalias.parquet", index=False)
    print(f"{len(out)} semanas atípicas de {len(t)} evaluadas ({100 * len(out) / len(t):.2f} %)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
