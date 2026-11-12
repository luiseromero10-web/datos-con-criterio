"""Puntos calientes: Getis-Ord Gi* sobre tasas municipales (contigüidad Queen del MGN 2018) con corrección FDR.

Ventanas de 52 semanas que terminan en la última semana confiable: 'ult' (más reciente) y 'prev' (las 52 anteriores).
Tasa = hechos de la ventana por 100 000 hab. (población 2026 de ambas ventanas, para aislar el cambio de hechos), suavizada con
Bayes empírico (esda) para que los municipios pequeños no dominen. Gi* sobre la tasa suavizada, z -> p de dos colas -> q (Benjamini-Hochberg).
Categorías: emergente (caliente ahora, no antes), persistente (en ambas), en_disminucion (antes sí, ahora no), frio, sin_patron.
"""
from __future__ import annotations

import sys
import warnings

import duckdb
import geopandas as gpd
import numpy as np
import pandas as pd
from esda.getisord import G_Local
from esda.smoothing import Empirical_Bayes
from libpysal.weights import Queen, w_subset
from scipy.stats import false_discovery_control, norm

from models.seguridad.series import ultima_semana_entrenamiento_fin
from pipelines.seguridad.config import DATA

Q_UMBRAL = 0.05
SEMANAS = 52


def cargar_pesos() -> tuple[pd.Index, Queen]:
    g = gpd.read_file(DATA / "raw" / "mgn_municipios_2018.geojson").rename(columns={"MPIO_CDPMP": "cod_mpio"})
    g["geometry"] = g.geometry.make_valid()
    g = g.sort_values("cod_mpio").reset_index(drop=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        w = Queen.from_dataframe(g, ids=g["cod_mpio"].tolist(), silence_warnings=True)
    return pd.Index(g["cod_mpio"]), w


def gi_estrella(tasa: np.ndarray, w) -> tuple[np.ndarray, np.ndarray]:
    """z de Gi* y q (FDR) por municipio."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        w.transform = "R"
        z = np.asarray(G_Local(tasa, w, transform="R", star=True, permutations=0).Zs)
    z = np.nan_to_num(z)
    p = 2 * norm.sf(np.abs(z))
    return z, false_discovery_control(p, method="bh")


def clasificar(z_ult, q_ult, z_prev, q_prev) -> np.ndarray:
    cal_u, cal_p = (q_ult < Q_UMBRAL) & (z_ult > 0), (q_prev < Q_UMBRAL) & (z_prev > 0)
    frio = (q_ult < Q_UMBRAL) & (z_ult < 0)
    return np.select([cal_u & cal_p, cal_u & ~cal_p, ~cal_u & cal_p, frio],
                     ["persistente", "emergente", "en_disminucion", "frio"], default="sin_patron")


def main() -> int:
    fin = ultima_semana_entrenamiento_fin()
    ult_ini, prev_ini = fin - pd.Timedelta(weeks=SEMANAS - 1), fin - pd.Timedelta(weeks=2 * SEMANAS - 1)
    ids, w = cargar_pesos()  # w.id_order == ids: los 1 122 polígonos del MGN, en el mismo orden que los vectores
    con = duckdb.connect()
    pob = con.execute(f"select cod_mpio, poblacion as pob from '{(DATA / 'ref' / 'poblacion.parquet').as_posix()}' where anio = 2026").df()
    pob_v = pob.set_index("cod_mpio")["pob"].reindex(ids).to_numpy(float)
    sin_pob = ~(pob_v > 0)  # p. ej. 94663 (Mapiripana): población 0 en el archivo del DANE y sin hechos; se excluye de los pesos
    if sin_pob.any():
        ids = ids[~sin_pob]
        pob_v = pob_v[~sin_pob]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            w = w_subset(w, list(ids), silence_warnings=True)
    hs = con.execute(f"select cod_mpio, delito, periodo, conteo from '{(DATA / 'gold' / 'hechos_semana_mpio.parquet').as_posix()}'").df()
    hs["periodo"] = pd.to_datetime(hs["periodo"])
    filas = []
    for delito, g in hs.groupby("delito"):
        out = {}
        for nombre, ini, fin_v in (("ult", ult_ini, fin), ("prev", prev_ini, ult_ini - pd.Timedelta(weeks=1))):
            ev = g[(g["periodo"] >= ini) & (g["periodo"] <= fin_v)].groupby("cod_mpio")["conteo"].sum().reindex(ids).fillna(0).to_numpy(float)
            eb = np.asarray(Empirical_Bayes(ev, pob_v).r) * 1e5
            z, q = gi_estrella(eb, w)
            out[nombre] = {"ev": ev, "raw": ev / pob_v * 1e5, "z": z, "q": q}
        cat = clasificar(out["ult"]["z"], out["ult"]["q"], out["prev"]["z"], out["prev"]["q"])
        filas.append(pd.DataFrame({
            "cod_mpio": ids, "delito": delito, "hechos_ult12m": out["ult"]["ev"], "hechos_prev12m": out["prev"]["ev"],
            "tasa_ult12m": out["ult"]["raw"].round(2), "tasa_prev12m": out["prev"]["raw"].round(2),
            "z_ult": out["ult"]["z"].round(2), "q_ult": out["ult"]["q"].round(4),
            "z_prev": out["prev"]["z"].round(2), "q_prev": out["prev"]["q"].round(4), "categoria": cat}))
    res = pd.concat(filas, ignore_index=True)
    res["ventana_ult_desde"], res["ventana_ult_hasta"] = ult_ini.date(), fin.date()
    (DATA / "gold").mkdir(parents=True, exist_ok=True)
    res.to_parquet(DATA / "gold" / "hotspots.parquet", index=False)
    print(res.groupby(["delito", "categoria"]).size().unstack(fill_value=0).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
