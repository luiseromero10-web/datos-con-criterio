"""Entrena y evalúa el modelo de alerta temprana de insolvencia (plan, sección 5).

Validación temporal (nunca se mezclan años): se entrena con los cierres anteriores a 2020, se elige y se calibra con 2020–2021 y se
prueba con 2022 (etiqueta completa hasta 2024). 2023, que también tiene etiqueta completa, es una segunda prueba.
Ventana de entrenamiento: el plan decía «≤ 2019», pero los eventos de 2017–2018 están incompletos (la base solo conserva los procesos que
seguían vivos en dic-2019; ver insolvencia.py), así que se compara entrenar con 2016–2019 y con 2018–2019 y se escoge por validación.

Líneas base obligatorias: Z'' de Altman y regresión logística. LightGBM solo se adopta si les gana en la prueba (PR-AUC y recall@5 %);
si no, se publica la mejor línea base elegida por validación. Es un resultado válido.

Salidas en models/finanzas/artifacts/: metrics.json, calibracion.json, seleccion.json y los modelos (altman.json, logit.json, lgbm.txt/json).
Los puntajes por sociedad quedan en data/finanzas/silver/alerta_puntajes.parquet (local, no se publica).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from models.finanzas import datos, metricas, puntuar
from models.finanzas.modelos import ModeloAltman, ModeloLgbm, ModeloLogit
from pipelines.finanzas.config import DATA

ARTEFACTOS = Path(__file__).with_name("artifacts")
VENTANAS = {"2018-2019": (2018, 2019), "2016-2019": (2016, 2017, 2018, 2019)}
VALIDACION = (2020, 2021)
PRUEBA = 2022
PRUEBA_2 = 2023
VALORES_C = (0.01, 0.1, 1.0)
MIN_GRUPO = 30  # las cifras agregadas solo se publican para grupos de al menos 30 sociedades


def poblacion(base: pd.DataFrame) -> pd.DataFrame:
    """Sociedades-año con etiqueta completa y que todavía no habían sido admitidas a un proceso."""
    return base[~base["ya_admitida"] & base["y"].notna()].copy()


def particiones(pob: pd.DataFrame, entrenamiento: tuple[int, ...]) -> dict[str, pd.DataFrame]:
    a = pob["anio"]
    return {"entrenamiento": pob[a.isin(entrenamiento)], "validacion": pob[a.isin(VALIDACION)], "prueba": pob[a == PRUEBA],
            "prueba_2023": pob[a == PRUEBA_2]}


def _y(df: pd.DataFrame) -> np.ndarray:
    return df["y"].to_numpy(float)


def ajustar_modelos(p: dict[str, pd.DataFrame]) -> dict:
    """Ajusta Altman, logística (C elegido por validación) y LightGBM (parada temprana en validación)."""
    tr, va = p["entrenamiento"], p["validacion"]
    altman = ModeloAltman().ajustar(tr, _y(tr))
    logit = max((ModeloLogit(C=c).ajustar(tr, _y(tr)) for c in VALORES_C), key=lambda m: metricas.pr_auc(_y(va), m.puntaje(va)))
    lgbm = ModeloLgbm().ajustar(tr, _y(tr), va, _y(va))
    return {"altman": altman, "logit": logit, "lgbm": lgbm}


def puntajes(modelo, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """(puntaje de orden, probabilidad calibrada). El de Altman es −Z''."""
    if isinstance(modelo, ModeloAltman):
        return modelo.puntaje(df), modelo.probabilidad(df)
    return modelo.puntaje(df), modelo.probabilidad(df)


def evaluar_modelos(modelos: dict, particion: dict[str, pd.DataFrame], con_intervalos: bool = True) -> dict:
    out: dict = {}
    for nombre, m in modelos.items():
        out[nombre] = {}
        for parte in ("validacion", "prueba", "prueba_2023"):
            df = particion[parte]
            ok = np.isfinite(puntajes(m, df)[0])
            df = df[ok]
            s, p = (v[ok] for v in puntajes(m, particion[parte]))
            r = metricas.resumen(_y(df), s, p)
            r["con_dato"] = float(ok.mean())  # fracción con puntaje (Altman no existe sin activos)
            if con_intervalos and parte != "validacion":
                r["ic95"] = metricas.bootstrap(_y(df), s, p)
            out[nombre][parte] = r
    return out


def elegir(metr: dict) -> dict:
    """Regla del plan: LightGBM se adopta solo si les gana a las dos líneas base en la prueba (2022: PR-AUC y recall@5 %).

    Para no decidir con un solo año, además no puede perder contra ninguna en la segunda prueba (2023). La validación (2020–2021) sirvió
    para elegir hiperparámetros, parar el entrenamiento y calibrar; no entra en esta regla. Si LightGBM no pasa, se publica la mejor
    línea base por PR-AUC de validación (resultado válido, según el plan).
    """
    val = {k: metr[k]["validacion"]["pr_auc"] for k in ("altman", "logit")}
    mejor_base = max(val, key=val.get)
    gana, no_pierde = {}, {}
    for base in ("altman", "logit"):
        g, h = metr["lgbm"]["prueba"], metr[base]["prueba"]
        gana[base] = bool(g["pr_auc"] > h["pr_auc"] and g["recall_5"] >= h["recall_5"])
        g2, h2 = metr["lgbm"]["prueba_2023"], metr[base]["prueba_2023"]
        no_pierde[base] = bool(g2["pr_auc"] >= h2["pr_auc"] and g2["recall_5"] >= h2["recall_5"])
    adoptado = "lgbm" if all(gana.values()) and all(no_pierde.values()) else mejor_base
    return {"publicado": adoptado, "mejor_linea_base_por_validacion": mejor_base, "lgbm_gana_en_prueba_2022": gana, "lgbm_no_pierde_en_2023": no_pierde,
            "pr_auc_validacion": {**val, "lgbm": metr["lgbm"]["validacion"]["pr_auc"]},
            "regla": "LightGBM se adopta si supera a Altman y a la logística en la prueba de 2022 (PR-AUC y recall@5 %) y no pierde contra ninguna en 2023; "
                     "si no, se publica la mejor línea base por PR-AUC de validación."}


def comparaciones(res: dict) -> dict:
    """Cuán firme es la ventaja de LightGBM: probabilidad (bootstrap pareado) de que supere a cada línea base."""
    out: dict = {}
    for parte in ("prueba", "prueba_2023"):
        df = res["particiones"][parte]
        ok = np.isfinite(puntajes(res["modelos"]["altman"], df)[0])
        df = df[ok]
        y = _y(df)
        s = {k: puntajes(m, df)[0] for k, m in res["modelos"].items()}
        out[parte] = {f"lgbm_vs_{b}": {"pr_auc": metricas.prob_mejora(y, s["lgbm"], s[b]),
                                       "recall_5": metricas.prob_mejora(y, s["lgbm"], s[b], metrica=metricas.recall_en_top)} for b in ("altman", "logit")}
        out[parte]["logit_vs_altman"] = {"pr_auc": metricas.prob_mejora(y, s["logit"], s["altman"])}
    out["nota"] = "Probabilidad de que el primer modelo supere al segundo al remuestrear las sociedades: 0,5 = empate; > 0,95 = ventaja clara."
    return out


def supervivencia(pob: pd.DataFrame) -> dict:
    """Quién deja de reportar: muchas sociedades en problemas desaparecen de la fuente y eso puede esconder eventos."""
    c = pob.dropna(subset=["deja_de_reportar"])
    por_anio = c.groupby("anio")["deja_de_reportar"].mean().round(4).to_dict()
    tabla = c.groupby("deja_de_reportar")["y"].agg(["size", "sum", "mean"]).round(5)
    return {
        "deja_de_reportar_por_anio": {int(k): float(v) for k, v in por_anio.items()},
        "tasa_evento_si_sigue": float(tabla.loc[0.0, "mean"]), "tasa_evento_si_deja": float(tabla.loc[1.0, "mean"]),
        "sociedades_que_dejan": int(tabla.loc[1.0, "size"]), "eventos_entre_las_que_dejan": int(tabla.loc[1.0, "sum"]),
        "pct_positivos_que_dejan": float(c.loc[c["y"] == 1, "deja_de_reportar"].mean()),
        "pct_negativos_que_dejan": float(c.loc[c["y"] == 0, "deja_de_reportar"].mean()),
        "nota": "Dejar de reportar no es un evento de insolvencia y no se mezcla en la etiqueta: es una salida aparte, aquí solo descrita.",
    }


def subgrupos(df: pd.DataFrame, s: np.ndarray, p: np.ndarray) -> dict:
    """Desempeño del modelo publicado dentro de subgrupos de la prueba (recall@5 % se calcula sobre el puntaje global)."""
    d = df.assign(_s=s, _p=p)
    top = d["_s"] >= np.sort(d["_s"].to_numpy())[::-1][max(0, int(np.ceil(0.05 * len(d))) - 1)]
    d["_top"] = top
    d["tercil_ingresos"] = pd.qcut(d["log_ingresos"].rank(method="first"), 3, labels=["bajo", "medio", "alto"])

    def fila(g: pd.DataFrame) -> dict:
        pos = g[g["y"] == 1]
        return {"n": len(g), "positivos": len(pos), "tasa": float(g["y"].mean()), "pr_auc": metricas.pr_auc(g["y"], g["_s"]),
                "recall_5_global": float(pos["_top"].mean()) if len(pos) else None}
    out: dict = {}
    for col in ("grupo", "tipo_estado", "tercil_ingresos", "familia_evento", "precision_evento", "deja_de_reportar"):
        sub = d[d["y"] == 1] if col in ("familia_evento", "precision_evento") else d
        out[col] = {str(k): fila(g) if col not in ("familia_evento", "precision_evento") else
                    {"positivos": len(g), "recall_5_global": float(g["_top"].mean())} for k, g in sub.groupby(col, dropna=True, observed=True)}
    fuertes = d["seccion"].value_counts().head(6).index
    out["seccion"] = {k: fila(g) for k, g in d[d["seccion"].isin(fuertes)].groupby("seccion")}
    return out


def entrenar(base: pd.DataFrame, ventanas: dict[str, tuple[int, ...]] | None = None, con_intervalos: bool = True) -> dict:
    """Entrena con cada ventana, elige la mejor por validación y evalúa. Devuelve todo lo necesario para guardar y reportar."""
    ventanas = ventanas or VENTANAS
    pob = poblacion(base)
    intentos = {}
    for nombre, anios in ventanas.items():
        p = particiones(pob, anios)
        m = ajustar_modelos(p)
        intentos[nombre] = {"particiones": p, "modelos": m, "metricas": evaluar_modelos(m, p, con_intervalos=False)}
    mejor = max(intentos, key=lambda k: max(intentos[k]["metricas"][m]["validacion"]["pr_auc"] for m in ("logit", "lgbm")))
    elegido = intentos[mejor]
    metr = evaluar_modelos(elegido["modelos"], elegido["particiones"], con_intervalos=con_intervalos)
    seleccion = elegir(metr)
    return {"pob": pob, "ventana": mejor, "ventanas": ventanas, "particiones": elegido["particiones"], "modelos": elegido["modelos"], "metricas": metr,
            "seleccion": seleccion, "sensibilidad": {k: {m: v["metricas"][m]["validacion"]["pr_auc"] for m in v["metricas"]} for k, v in intentos.items()}}


def curvas(res: dict) -> dict:
    out: dict = {}
    for nombre, m in res["modelos"].items():
        out[nombre] = {}
        for parte in ("prueba", "prueba_2023"):
            df = res["particiones"][parte]
            s, p = puntajes(m, df)
            ok = np.isfinite(s)
            out[nombre][parte] = metricas.curva_calibracion(_y(df)[ok], p[ok])
    return out


def guardar(res: dict, carpeta: Path = ARTEFACTOS) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    m = res["modelos"]
    (carpeta / "altman.json").write_text(json.dumps(m["altman"].a_json(), indent=1), encoding="utf-8")
    (carpeta / "logit.json").write_text(json.dumps(m["logit"].a_json()), encoding="utf-8")
    m["lgbm"].guardar(carpeta)
    sel = dict(res["seleccion"])
    pub = m[sel["publicado"]]
    val = res["particiones"]["validacion"]
    sel["ventana_entrenamiento"] = {"elegida": res["ventana"], "anios": list(res["ventanas"][res["ventana"]]), "pr_auc_validacion_por_ventana": res["sensibilidad"]}
    sel["validacion"], sel["prueba"], sel["prueba_2"] = list(VALIDACION), PRUEBA, PRUEBA_2
    sel["umbral_perfil_alto"] = float(np.percentile(pub.probabilidad(val)[np.isfinite(puntajes(pub, val)[0])], 95))
    sel["umbral_perfil_alto_nota"] = "Probabilidad calibrada en el percentil 95 de las sociedades de 2020–2021 (≈ el 5 % de mayor riesgo); fijo para comparar años."
    (carpeta / "seleccion.json").write_text(json.dumps(sel, ensure_ascii=False, indent=1), encoding="utf-8")


def reportar(res: dict, base: pd.DataFrame) -> dict:
    pub = res["modelos"][res["seleccion"]["publicado"]]
    prueba = res["particiones"]["prueba"]
    s, p = puntajes(pub, prueba)
    ok = np.isfinite(s)
    pob = res["pob"]
    return {
        "etiqueta": {"definicion": "Admisión a reorganización o a cualquier liquidación en los años t+1 o t+2 del cierre t, por NIT, uniendo los cortes de la base de la Supersociedades",
                     "poblacion": "sociedades-año con estados individuales o separados, con etiqueta completa y no admitidas antes de t o en t",
                     "positivos_por_anio": {int(k): int(v) for k, v in pob.groupby("anio")["y"].sum().items()},
                     "tasa_por_anio": {int(k): round(float(v), 5) for k, v in pob.groupby("anio")["y"].mean().items()},
                     "tipo_de_los_positivos": pob.loc[pob["y"] == 1, "familia_evento"].value_counts().to_dict(),
                     "precision_del_ano_de_admision": pob.loc[pob["y"] == 1, "precision_evento"].value_counts().to_dict()},
        "particion": {"entrenamiento": {"ventana": res["ventana"], "anios": list(res["ventanas"][res["ventana"]]), "n": len(res["particiones"]["entrenamiento"])},
                      "validacion": {"anios": list(VALIDACION), "n": len(res["particiones"]["validacion"])},
                      "prueba": {"anio": PRUEBA, "n": len(prueba)}, "prueba_2": {"anio": PRUEBA_2, "n": len(res["particiones"]["prueba_2023"])}},
        "seleccion": res["seleccion"],
        "metricas": res["metricas"],
        "sensibilidad_ventana": res["sensibilidad"],
        "comparaciones": comparaciones(res),
        "oportunidad": oportunidad(res["pob"], base),
        "supervivencia": supervivencia(pob),
        "subgrupos_prueba": subgrupos(prueba[ok], s[ok], p[ok]),
        "variables_logit": res["modelos"]["logit"].coeficientes(),
        "variables_lgbm": res["modelos"]["lgbm"].importancias(),
        "umbral_altman_publicado": {"zona_alerta": "Z'' < 4,35", "prueba": _umbral_altman(prueba)},
    }


def oportunidad(pob: pd.DataFrame, base: pd.DataFrame) -> dict:
    """Los estados del año t se presentan a lo largo del año t+1: parte de las admisiones de t+1 ocurre antes de que existan los estados."""
    del base
    pos = pob[(pob["y"] == 1) & (pob["fecha_primera_admision"].notna())]
    en_t1 = pos[pos["fecha_primera_admision"].dt.year == pos["anio"] + 1]
    return {"positivos_con_fecha_exacta": len(pos), "admitidos_en_t1": len(en_t1),
            "pct_de_t1_en_el_primer_trimestre": float((en_t1["fecha_primera_admision"].dt.month <= 3).mean()) if len(en_t1) else None,
            "pct_de_t1_en_el_primer_semestre": float((en_t1["fecha_primera_admision"].dt.month <= 6).mean()) if len(en_t1) else None,
            "nota": "Esas admisiones ocurren antes (o casi al tiempo) de que se publiquen los estados de t: el modelo mide perfil, no es un aviso con meses de anticipación."}


def _umbral_altman(df: pd.DataFrame) -> dict:
    z = df["altman_z2"]
    flag = z < 4.35
    y = df["y"]
    return {"marcadas": float(flag.mean()), "precision": float(y[flag].mean()), "recall": float(flag[y == 1].mean())}


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    base = pd.read_parquet(DATA / "silver" / "base_modelo.parquet") if (DATA / "silver" / "base_modelo.parquet").exists() else datos.construir()
    res = entrenar(base)
    guardar(res)
    rep = reportar(res, base)
    (ARTEFACTOS / "metrics.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
    (ARTEFACTOS / "calibracion.json").write_text(json.dumps(curvas(res), indent=1), encoding="utf-8")
    pub = res["modelos"][res["seleccion"]["publicado"]]
    todo = pd.DataFrame({"nit": base["nit"], "anio": base["anio"]})
    for nombre, m in res["modelos"].items():
        todo[f"p_{nombre}"] = m.probabilidad(base)
    todo["p_publicado"] = pub.probabilidad(base)
    todo.to_parquet(DATA / "silver" / "alerta_puntajes.parquet", index=False)
    estado = pd.read_parquet(DATA / "gold" / "empresas_anio.parquet", columns=["nit", "anio"])
    puntuar.historia(base, estado).to_parquet(ARTEFACTOS / "historia_agregada.parquet", index=False)
    s = res["seleccion"]
    print("ventana:", res["ventana"], "| publicado:", s["publicado"], "| PR-AUC validación:", {k: round(v, 4) for k, v in s["pr_auc_validacion"].items()})
    for m in ("altman", "logit", "lgbm"):
        r = res["metricas"][m]["prueba"]
        print(f"prueba 2022  {m:7s} PR-AUC {r['pr_auc']:.4f} {r.get('ic95', {}).get('pr_auc', '')}  recall@5% {r['recall_5']:.3f}  Brier {r['brier']:.5f}  (tasa base {r['tasa_base']:.4f})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
