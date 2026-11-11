"""Pronóstico de 16 semanas con el método vigente (seleccion.json) e intervalos conformales -> gold/predicciones.parquet."""
from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from mlforecast import MLForecast
from mlforecast.lag_transforms import RollingMean
from statsforecast import StatsForecast
from statsforecast.models import TSB, AutoETS, AutoTheta

from models.seguridad.metricas import intervalo
from models.seguridad.prep import H, calendario, construir_series
from pipelines.seguridad.config import DATA

ARTEFACTOS = Path(__file__).parent / "artifacts"
CANDIDATOS = ["AutoETS", "AutoTheta", "TSB", "LightGBM"]


def cargar_seleccion() -> tuple[dict, str]:
    """Usa data/modelos/seleccion.json (la más reciente del entrenamiento mensual) o la versionada en el repo."""
    for ruta in (DATA / "modelos" / "seleccion.json", ARTEFACTOS / "seleccion.json"):
        if ruta.exists():
            return json.loads(ruta.read_text(encoding="utf-8")), str(ruta)
    raise FileNotFoundError("No hay seleccion.json; ejecute models.seguridad.backtest y evaluar")


def _estadisticos(s: pd.DataFrame, nombres: list[str]) -> pd.DataFrame:
    modelos = {"AutoETS": AutoETS(season_length=1), "AutoTheta": AutoTheta(season_length=52), "TSB": TSB(alpha_d=0.2, alpha_p=0.2)}
    sf = StatsForecast(models=[modelos[n] for n in nombres], freq="W-MON", n_jobs=-1)
    return sf.forecast(df=s[["unique_id", "ds", "y"]], h=H)


def _lightgbm(s: pd.DataFrame) -> pd.DataFrame:
    fin = s["ds"].max()
    futuras = pd.date_range(fin + pd.Timedelta(weeks=1), periods=H, freq="7D")
    cal = calendario(pd.DatetimeIndex(sorted(set(s["ds"]) | set(futuras))))
    df = s.merge(cal, on="ds", how="left")
    primer = s["ds"].min() + pd.Timedelta(weeks=(len(s["ds"].unique()) - 8 * 12 - H))
    escala = df[df["ds"] <= primer].groupby("unique_id")["y"].mean().rename("escala")
    df = df.merge(escala, on="unique_id", how="left")
    df["delito"], df["nivel"] = df["delito"].astype("category"), df["nivel"].astype("category")
    modelo = lgb.LGBMRegressor(objective="poisson", n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=20,
                               subsample=0.8, subsample_freq=1, colsample_bytree=0.8, random_state=7, verbose=-1)
    fc = MLForecast(models={"LightGBM": modelo}, freq="W-MON", lags=[1, 2, 3, 4, 8, 13, 26, 52],
                    lag_transforms={1: [RollingMean(4), RollingMean(13)], 4: [RollingMean(13)]})
    cols = ["unique_id", "ds", "y", "delito", "nivel", "escala", "festivos", "quincena", "semana_anio", "mes"]
    fc.fit(df[cols], static_features=["delito", "nivel", "escala"])
    ids = df[["unique_id", "delito", "nivel", "escala"]].drop_duplicates("unique_id")
    x = ids.merge(cal[cal["ds"].isin(futuras)][["ds", "festivos", "quincena", "semana_anio", "mes"]], how="cross")
    return fc.predict(h=H, X_df=x[["unique_id", "ds", "festivos", "quincena", "semana_anio", "mes"]])


def pronosticar(metodo: str, s: pd.DataFrame) -> pd.Series:
    """Devuelve yhat (índice unique_id, ds) del método: un modelo o 'Promedio' de los cuatro."""
    nombres = CANDIDATOS if metodo == "Promedio" else [metodo]
    partes = []
    stat = [n for n in nombres if n != "LightGBM"]
    if stat:
        f = _estadisticos(s, stat)
        partes += [f.set_index(["unique_id", "ds"])[n] for n in stat]
    if "LightGBM" in nombres:
        partes.append(_lightgbm(s).set_index(["unique_id", "ds"])["LightGBM"])
    return pd.concat(partes, axis=1).mean(axis=1).clip(lower=0)


def main() -> int:
    sel, origen = cargar_seleccion()
    metodo = next(iter(sel["modelos"].values()))
    s = construir_series()
    yhat = pronosticar(metodo, s).rename("p50").reset_index()
    yhat["h"] = ((yhat["ds"] - s["ds"].max()).dt.days // 7).astype(int)
    partes = yhat["unique_id"].str.split("|", expand=True)
    yhat["delito"], yhat["nivel"], yhat["cod"] = partes[0], partes[1], partes[2]
    yhat["tramo"] = np.where(yhat["h"] <= 8, "h1_8", "h9_16")
    lo, hi = np.zeros(len(yhat)), np.zeros(len(yhat))
    for (d, n, t), idx in yhat.groupby(["delito", "nivel", "tramo"]).groups.items():
        q = sel["conformal_q"][f"{d}|{n}|{t}"]
        lo[yhat.index.get_indexer(idx)], hi[yhat.index.get_indexer(idx)] = intervalo(yhat.loc[idx, "p50"], q[0], q[1])
    yhat["p10"], yhat["p90"] = np.round(lo, 3), np.round(hi, 3)
    yhat["p50"] = yhat["p50"].round(3)
    meta = json.loads((DATA / "gold" / "metadatos.json").read_text(encoding="utf-8")) if (DATA / "gold" / "metadatos.json").exists() else {}
    corte = meta.get("fecha_corte")
    yhat["tipo"] = np.where(yhat["ds"] <= pd.Timestamp(corte), "provisional", "futuro") if corte else "futuro"
    out = yhat.rename(columns={"ds": "periodo"})[["periodo", "nivel", "cod", "delito", "h", "p10", "p50", "p90", "tipo"]]
    (DATA / "gold").mkdir(parents=True, exist_ok=True)
    out.to_parquet(DATA / "gold" / "predicciones.parquet", index=False)
    meta.update({"version_modelo": f"{metodo}-{datetime.now(UTC):%Y-%m}", "metodo": metodo, "horizonte_semanas": H,
                 "ultima_semana_entrenamiento": str(s["ds"].max().date())})
    (DATA / "gold" / "metadatos.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    for nombre in ("metrics.json",):
        for base in (DATA / "modelos", ARTEFACTOS):
            if (base / nombre).exists():
                (DATA / "gold" / nombre).write_text((base / nombre).read_text(encoding="utf-8"), encoding="utf-8")
                break
    print(f"{len(out)} predicciones, método {metodo} ({origen}); semanas {out['periodo'].min().date()} a {out['periodo'].max().date()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
