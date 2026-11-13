"""Métricas del modelo de alerta (plan, sección 5): PR-AUC, recall en el 5 % de mayor riesgo, Brier y calibración, con intervalos."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score


def pr_auc(y, s) -> float:
    """Área bajo la curva precisión–exhaustividad (precisión promedio). La base de comparación es la tasa de positivos."""
    return float(average_precision_score(y, s)) if np.sum(y) > 0 else float("nan")


def roc_auc(y, s) -> float:
    return float(roc_auc_score(y, s)) if 0 < np.sum(y) < len(y) else float("nan")


def _top(s, fraccion: float) -> np.ndarray:
    k = max(1, int(np.ceil(fraccion * len(s))))
    return np.argsort(-np.asarray(s, float), kind="stable")[:k]


def recall_en_top(y, s, fraccion: float = 0.05) -> float:
    """Porcentaje de los positivos que caen entre las sociedades del `fraccion` de mayor puntaje."""
    y = np.asarray(y, float)
    return float(y[_top(s, fraccion)].sum() / y.sum()) if y.sum() > 0 else float("nan")


def precision_en_top(y, s, fraccion: float = 0.05) -> float:
    y = np.asarray(y, float)
    return float(y[_top(s, fraccion)].mean())


def brier(y, p) -> float:
    y, p = np.asarray(y, float), np.asarray(p, float)
    return float(np.mean((p - y) ** 2))


def brier_skill(y, p) -> float:
    """1 − Brier / Brier de predecir siempre la tasa base. Positivo = mejor que no saber nada."""
    y = np.asarray(y, float)
    base = brier(y, np.full_like(y, y.mean()))
    return float(1 - brier(y, p) / base) if base > 0 else float("nan")


def curva_calibracion(y, p, grupos: int = 10) -> list[dict]:
    """Por grupos de igual tamaño de probabilidad prevista: probabilidad media prevista y tasa observada."""
    y, p = np.asarray(y, float), np.asarray(p, float)
    orden = np.argsort(p, kind="stable")
    filas = []
    for idx in np.array_split(orden, grupos):
        filas.append({"n": len(idx), "prevista": float(p[idx].mean()), "observada": float(y[idx].mean()), "positivos": int(y[idx].sum())})
    return filas


def error_calibracion(y, p, grupos: int = 10) -> float:
    """Error de calibración esperado: diferencia absoluta media entre lo previsto y lo observado, ponderada por tamaño del grupo."""
    c = curva_calibracion(y, p, grupos)
    n = sum(g["n"] for g in c)
    return float(sum(g["n"] * abs(g["prevista"] - g["observada"]) for g in c) / n)


def resumen(y, s, p) -> dict:
    """Todas las métricas de un modelo en un conjunto. `s` ordena por riesgo y `p` es la probabilidad calibrada."""
    y = np.asarray(y, float)
    return {
        "n": len(y), "positivos": int(y.sum()), "tasa_base": float(y.mean()),
        "pr_auc": pr_auc(y, s), "roc_auc": roc_auc(y, s),
        "recall_5": recall_en_top(y, s, 0.05), "precision_5": precision_en_top(y, s, 0.05),
        "recall_10": recall_en_top(y, s, 0.10),
        "brier": brier(y, p), "brier_skill": brier_skill(y, p), "ece": error_calibracion(y, p),
    }


def bootstrap(y, s, p, repeticiones: int = 1000, semilla: int = 0) -> dict[str, list[float]]:
    """Intervalos del 95 % (percentiles 2,5 y 97,5) de PR-AUC, recall@5 % y Brier remuestreando sociedades."""
    rng = np.random.default_rng(semilla)
    y, s, p = np.asarray(y, float), np.asarray(s, float), np.asarray(p, float)
    n = len(y)
    out: dict[str, list[float]] = {"pr_auc": [], "recall_5": [], "brier": []}
    for _ in range(repeticiones):
        i = rng.integers(0, n, n)
        if y[i].sum() == 0:
            continue
        out["pr_auc"].append(pr_auc(y[i], s[i]))
        out["recall_5"].append(recall_en_top(y[i], s[i]))
        out["brier"].append(brier(y[i], p[i]))
    return {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in out.items()}


def prob_mejora(y, s_a, s_b, repeticiones: int = 1000, semilla: int = 0, metrica=pr_auc) -> float:
    """Probabilidad (bootstrap pareado) de que el puntaje A supere al B en la métrica: 0,5 = empate, cerca de 1 = A gana con claridad."""
    rng = np.random.default_rng(semilla)
    y, s_a, s_b = np.asarray(y, float), np.asarray(s_a, float), np.asarray(s_b, float)
    n, gana, validas = len(y), 0, 0
    for _ in range(repeticiones):
        i = rng.integers(0, n, n)
        if y[i].sum() == 0:
            continue
        validas += 1
        gana += metrica(y[i], s_a[i]) > metrica(y[i], s_b[i])
    return gana / max(validas, 1)
