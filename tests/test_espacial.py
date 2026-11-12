"""Pruebas de anomalías y puntos calientes con datos sintéticos."""
import numpy as np
import pandas as pd
from libpysal.weights import lat2W

from models.seguridad.anomalias import UMBRAL_Z, calcular
from models.seguridad.hotspots import Q_UMBRAL, clasificar, gi_estrella


def _serie(valores):
    n = len(valores)
    return pd.DataFrame({"unique_id": "homicidio|dpto|05", "ds": pd.date_range("2022-01-03", periods=n, freq="7D"), "y": valores})


def test_anomalia_detecta_un_pico_evidente():
    rng = np.random.default_rng(1)
    y = rng.poisson(20, 120).astype(float)
    y[90] = 90
    t = calcular(_serie(y))
    marcadas = t[t["z"].abs() > UMBRAL_Z]
    assert t.loc[t["periodo"] == pd.Timestamp("2022-01-03") + pd.Timedelta(weeks=90), "z"].iloc[0] > UMBRAL_Z
    assert len(marcadas) <= 4


def test_anomalia_serie_estable_casi_sin_alertas():
    rng = np.random.default_rng(2)
    t = calcular(_serie(rng.poisson(30, 200).astype(float)))
    assert (t["z"].abs() > UMBRAL_Z).mean() < 0.02


def test_anomalia_ignora_series_cortas():
    assert len(calcular(_serie(np.ones(20)))) == 0


def test_gi_estrella_encuentra_conglomerado_en_malla():
    w = lat2W(12, 12)
    y = np.ones(144)
    for i in (0, 1, 12, 13):  # esquina con valores altos
        y[i] = 50
    y = y + np.random.default_rng(3).normal(0, 0.2, 144)
    z, q = gi_estrella(y, w)
    assert z[0] > 2 and q[0] < Q_UMBRAL
    assert (q <= 1).all() and (q >= 0).all()


def test_clasificar_las_cuatro_categorias():
    z_u = np.array([3.0, 3.0, 0.0, -3.0, 0.5])
    q_u = np.array([0.01, 0.01, 0.9, 0.01, 0.9])
    z_p = np.array([3.0, 0.0, 3.0, 0.0, 0.0])
    q_p = np.array([0.01, 0.9, 0.01, 0.9, 0.9])
    assert list(clasificar(z_u, q_u, z_p, q_p)) == ["persistente", "emergente", "en_disminucion", "frio", "sin_patron"]


def test_anomalia_serie_casi_todo_ceros_no_da_puntajes_absurdos():
    y = np.zeros(200)
    y[[40, 120]] = 2
    t = calcular(_serie(y))
    assert t["z"].abs().max() < 20
