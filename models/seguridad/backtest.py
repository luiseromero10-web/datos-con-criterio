"""Backtest con origen rodante: 12 cortes, horizonte de 8 semanas, paso de 8. Nunca validación aleatoria.

Salida: data/modelos/backtest.parquet (unique_id, ds, cutoff, y, un modelo por columna).
"""
from __future__ import annotations

import sys
import time

import lightgbm as lgb
import pandas as pd
from mlforecast import MLForecast
from mlforecast.lag_transforms import RollingMean
from statsforecast import StatsForecast
from statsforecast.models import TSB, AutoETS, AutoTheta, SeasonalNaive, WindowAverage

from models.seguridad.prep import H, calendario, construir_series
from pipelines.seguridad.config import DATA

N_VENTANAS = 12
PASO = 8
MODELOS_STAT = ["SeasonalNaive", "WindowAverage", "AutoETS", "AutoTheta", "TSB"]


def _estadisticos(s: pd.DataFrame) -> pd.DataFrame:
    sf = StatsForecast(
        models=[SeasonalNaive(52), WindowAverage(4), AutoETS(season_length=1), AutoTheta(season_length=52),
                TSB(alpha_d=0.2, alpha_p=0.2)],
        freq="W-MON", n_jobs=-1)
    return sf.cross_validation(df=s[["unique_id", "ds", "y"]], h=H, n_windows=N_VENTANAS, step_size=PASO)


def _lightgbm(s: pd.DataFrame, primer_corte: pd.Timestamp) -> pd.DataFrame:
    cal = calendario(pd.DatetimeIndex(sorted(s["ds"].unique())))
    df = s.merge(cal, on="ds", how="left")
    escala = df[df["ds"] <= primer_corte].groupby("unique_id")["y"].mean().rename("escala")
    df = df.merge(escala, on="unique_id", how="left")
    df["delito"] = df["delito"].astype("category")
    df["nivel"] = df["nivel"].astype("category")
    modelo = lgb.LGBMRegressor(objective="poisson", n_estimators=300, learning_rate=0.05, num_leaves=31,
                               min_child_samples=20, subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                               random_state=7, verbose=-1)
    fc = MLForecast(models={"LightGBM": modelo}, freq="W-MON", lags=[1, 2, 3, 4, 8, 13, 26, 52],
                    lag_transforms={1: [RollingMean(4), RollingMean(13)], 4: [RollingMean(13)]})
    cols = ["unique_id", "ds", "y", "delito", "nivel", "escala", "festivos", "quincena", "semana_anio", "mes"]
    return fc.cross_validation(df=df[cols], n_windows=N_VENTANAS, h=H, step_size=PASO,
                               static_features=["delito", "nivel", "escala"])


def main() -> None:
    s = construir_series()
    t0 = time.time()
    stat = _estadisticos(s)
    print(f"estadísticos listos en {time.time() - t0:.0f} s", flush=True)
    primer_corte = stat["cutoff"].min()
    ml = _lightgbm(s, primer_corte)
    print(f"lightgbm listo en {time.time() - t0:.0f} s", flush=True)
    out = stat.merge(ml[["unique_id", "ds", "cutoff", "LightGBM"]], on=["unique_id", "ds", "cutoff"], how="left")
    for c in MODELOS_STAT + ["LightGBM"]:
        out[c] = out[c].clip(lower=0)
    destino = DATA / "modelos"
    destino.mkdir(parents=True, exist_ok=True)
    out.to_parquet(destino / "backtest.parquet", index=False)
    print("backtest:", len(out), "filas,", out["cutoff"].nunique(), "cortes", flush=True)


if __name__ == "__main__":
    sys.exit(main())
