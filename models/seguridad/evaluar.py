"""EvalÃºa el backtest: selecciona modelo por delito y nivel, calibra intervalos y escribe metrics.json.

Protocolo (para no medir sobre lo mismo que se usÃ³ para elegir):
  - cortes 1-6 (los mÃ¡s antiguos): elegir el modelo y calibrar los intervalos conformales;
  - cortes 7-12 (los mÃ¡s recientes): reportar WAPE, MASE y cobertura fuera de muestra.
ProducciÃ³n: se vuelven a calibrar los cuantiles con los 12 cortes.
"""
from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd

from models.seguridad.metricas import cobertura, intervalo, mase, puntaje_normalizado, wape
from models.seguridad.prep import construir_series
from pipelines.seguridad.config import DATA

CANDIDATOS = ["AutoETS", "AutoTheta", "TSB", "LightGBM"]
PROMEDIO = "Promedio"  # media simple de los cuatro candidatos
BASES = ["SeasonalNaive", "WindowAverage"]
NIVEL_INTERVALO = (0.10, 0.90)  # p10 / p90 => intervalo del 80 %


def _escalas(s: pd.DataFrame, primer_corte: pd.Timestamp) -> pd.Series:
    tr = s[s["ds"] <= primer_corte]
    return tr.groupby("unique_id")["y"].apply(lambda v: float(np.abs(np.diff(v.values)).mean()) or 1.0)


def main() -> None:
    bt = pd.read_parquet(DATA / "modelos" / "backtest.parquet")
    s = construir_series()
    bt["delito"] = bt["unique_id"].str.split("|").str[0]
    bt["nivel"] = bt["unique_id"].str.split("|").str[1]
    bt["h"] = ((bt["ds"] - bt["cutoff"]).dt.days // 7).astype(int)
    bt["tramo"] = np.where(bt["h"] <= 8, "h1_8", "h9_16")
    cortes = sorted(bt["cutoff"].unique())
    calib, evalu = bt[bt["cutoff"].isin(cortes[:6])], bt[bt["cutoff"].isin(cortes[6:])]
    escala = _escalas(s, cortes[0])
    for d in (bt, calib, evalu):
        d[PROMEDIO] = d[CANDIDATOS].mean(axis=1)

    modelos = BASES + CANDIDATOS + [PROMEDIO]
    # Un Ãºnico mÃ©todo para todos los grupos, elegido con los cortes 1-6 (elegir por grupo sobreajusta con tan pocas series).
    unico = min(CANDIDATOS + [PROMEDIO], key=lambda m: wape(calib["y"], calib[m]))
    resultado = {"ventanas": len(cortes), "horizonte_semanas": 16, "cortes": [str(c)[:10] for c in cortes],
                 "metodo_elegido": unico, "protocolo": "elegir y calibrar con cortes 1-6; reportar con cortes 7-12", "por_grupo": {}, "global": {}}
    seleccion, conformal = {}, {}

    for (delito, nivel), g_cal in calib.groupby(["delito", "nivel"]):
        g_ev = evalu[(evalu["delito"] == delito) & (evalu["nivel"] == nivel)]
        w_cal = {m: wape(g_cal["y"], g_cal[m]) for m in modelos}
        elegido = unico
        base_mejor = min(BASES, key=lambda m: w_cal[m])
        sc = escala.reindex(g_ev["unique_id"]).values
        fila = {"modelo_elegido": elegido, "base_referencia": base_mejor, "n_series": int(g_ev["unique_id"].nunique())}
        for m in modelos:
            fila[f"wape_{m}"] = round(wape(g_ev["y"], g_ev[m]), 4)
            fila[f"mase_{m}"] = round(mase(g_ev["y"], g_ev[m], sc), 4)
        fila["mejora_vs_base_pct"] = round(100 * (1 - fila[f"wape_{elegido}"] / fila[f"wape_{base_mejor}"]), 1)
        # intervalos: cuantiles de los residuos normalizados en calibraciÃ³n, cobertura en evaluaciÃ³n
        z = puntaje_normalizado(g_cal["y"], g_cal[elegido])
        q_lo, q_hi = (float(np.quantile(z, q)) for q in NIVEL_INTERVALO)
        lo, hi = intervalo(g_ev[elegido], q_lo, q_hi)
        fila["cobertura_80"] = round(cobertura(g_ev["y"], lo, hi), 3)
        resultado["por_grupo"][f"{delito}|{nivel}"] = fila
        seleccion[f"{delito}|{nivel}"] = elegido
        # cuantiles de producciÃ³n por tramo de horizonte: todos los cortes
        todo = bt[(bt["delito"] == delito) & (bt["nivel"] == nivel)]
        for tramo, gt in todo.groupby("tramo"):
            zt = puntaje_normalizado(gt["y"], gt[elegido])
            conformal[f"{delito}|{nivel}|{tramo}"] = [float(np.quantile(zt, q)) for q in NIVEL_INTERVALO]

    # agregados globales (todos los delitos y niveles) fuera de muestra
    sc_all = escala.reindex(evalu["unique_id"]).values
    for m in modelos:
        resultado["global"][m] = {"wape": round(wape(evalu["y"], evalu[m]), 4), "mase": round(mase(evalu["y"], evalu[m], sc_all), 4)}
    ev = evalu.copy()
    ev["elegido"] = [seleccion[f"{d}|{n}"] for d, n in zip(ev["delito"], ev["nivel"])]
    ev["yhat_elegido"] = [row[m] for row, m in zip(ev.to_dict("records"), ev["elegido"])]
    resultado["global"]["MODELO_ELEGIDO"] = {"wape": round(wape(ev["y"], ev["yhat_elegido"]), 4),
                                             "mase": round(mase(ev["y"], ev["yhat_elegido"], sc_all), 4)}
    base_w = min(resultado["global"][b]["wape"] for b in BASES)
    resultado["global"]["mejora_vs_mejor_base_pct"] = round(100 * (1 - resultado["global"]["MODELO_ELEGIDO"]["wape"] / base_w), 1)
    por_delito = {}
    for delito, g in ev.groupby("delito"):
        we, wb = wape(g["y"], g["yhat_elegido"]), min(wape(g["y"], g[b]) for b in BASES)
        por_delito[delito] = {"wape_elegido": round(we, 4), "wape_mejor_base": round(wb, 4), "mejora_pct": round(100 * (1 - we / wb), 1)}
    resultado["por_delito"] = por_delito
    tramos = {}
    for tramo, g in ev.groupby("tramo"):
        base_w_t = min(wape(g["y"], g[b]) for b in BASES)
        cub = []
        for (d, n), gg in g.groupby(["delito", "nivel"]):
            ql, qh = (float(np.quantile(puntaje_normalizado(calib[(calib["delito"] == d) & (calib["nivel"] == n) & (calib["tramo"] == tramo)]["y"],
                      calib[(calib["delito"] == d) & (calib["nivel"] == n) & (calib["tramo"] == tramo)][unico]), qq)) for qq in NIVEL_INTERVALO)
            lo, hi = intervalo(gg[unico], ql, qh)
            cub.append(cobertura(gg["y"], lo, hi) * len(gg))
        tramos[tramo] = {"wape_elegido": round(wape(g["y"], g["yhat_elegido"]), 4), "wape_mejor_base": round(base_w_t, 4),
                         "mejora_pct": round(100 * (1 - wape(g["y"], g["yhat_elegido"]) / base_w_t), 1),
                         "cobertura_80": round(sum(cub) / len(g), 3)}
    resultado["por_tramo_horizonte"] = tramos
    resultado["delitos_que_mejoran"] = f"{sum(v['mejora_pct'] > 0 for v in por_delito.values())} de {len(por_delito)}"

    (DATA / "modelos").mkdir(parents=True, exist_ok=True)
    (DATA / "modelos" / "metrics.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "modelos" / "seleccion.json").write_text(json.dumps({"modelos": seleccion, "conformal_q": conformal}, indent=2), encoding="utf-8")
    print(json.dumps({"global": resultado["global"], "por_delito": por_delito, "por_tramo_horizonte": tramos, "delitos_que_mejoran": resultado["delitos_que_mejoran"]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.exit(main())
