"""Métricas de pronóstico: WAPE, MASE y cobertura de intervalos."""
from __future__ import annotations

import numpy as np
import pandas as pd


def wape(y: pd.Series | np.ndarray, yhat: pd.Series | np.ndarray) -> float:
    y, yhat = np.asarray(y, float), np.asarray(yhat, float)
    return float(np.abs(y - yhat).sum() / max(y.sum(), 1e-9))


def mase(y, yhat, escala) -> float:
    """Error absoluto medio dividido por el de la predicción 'igual a la semana anterior' en entrenamiento."""
    y, yhat, escala = np.asarray(y, float), np.asarray(yhat, float), np.asarray(escala, float)
    return float((np.abs(y - yhat) / escala).mean())


def cobertura(y, lo, hi) -> float:
    y, lo, hi = np.asarray(y, float), np.asarray(lo, float), np.asarray(hi, float)
    return float(((y >= lo) & (y <= hi)).mean())


def puntaje_normalizado(y, yhat) -> np.ndarray:
    """Residuo escalado para intervalos conformales: (y - yhat) / sqrt(yhat + 1). Aproximadamente homocedástico en conteos."""
    y, yhat = np.asarray(y, float), np.asarray(yhat, float)
    return (y - yhat) / np.sqrt(yhat + 1.0)


def intervalo(yhat, q_lo: float, q_hi: float) -> tuple[np.ndarray, np.ndarray]:
    yhat = np.asarray(yhat, float)
    f = np.sqrt(yhat + 1.0)
    return np.maximum(yhat + q_lo * f, 0.0), yhat + q_hi * f
