"""Base de modelado del modelo de alerta temprana (plan, sección 5): una fila por sociedad y año de cierre *t*.

Etiqueta `y`: la sociedad es admitida a reorganización o a liquidación (cualquier tipo; ver `pipelines/finanzas/insolvencia.py`) en los
años t+1 o t+2, es decir, en los 24 meses siguientes al cierre. Se excluyen de la población las sociedades que ya habían sido admitidas
en t o antes: para ellas la pregunta carece de sentido.

Variables: solo lo que se sabe del año t y anteriores (indicadores de t, sus cambios frente a t−1, percentiles frente a los pares del
mismo año, tamaño, edad, sector, región, grupo NIIF y señales). Quedan fuera `estado_actual` y la señal `estado_distinto_activa`: la
carátula la diligencia al presentar los estados (meses después del cierre) y delataría una admisión ocurrida en t+1.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.finanzas import indicadores as ind_
from pipelines.finanzas import pares as pares_
from pipelines.finanzas import senales as sen_
from pipelines.finanzas.config import DATA

ULTIMO_ANIO_EVENTOS = 2025  # los eventos llegan a oct-2026: los años hasta 2025 están completos (2026 es parcial)
DELTAS = ("roa", "margen_operacional", "margen_neto", "razon_corriente", "endeudamiento", "dias_cartera", "flujo_operacion_ingresos")
SENALES = tuple(s for s in sen_.IDS if s != "estado_distinto_activa")
CATEGORICAS = ("seccion", "departamento", "grupo", "tipo_estado")
PCT = tuple(f"pct_{i}" for i in ind_.IDS)

NUMERICAS = (
    *ind_.IDS,
    *(f"delta_{d}" for d in DELTAS),
    "log_activo", "log_ingresos", "edad", "n_reportes",
    *PCT,
    *SENALES,
    "n_senales",
)
VARIABLES = (*NUMERICAS, *CATEGORICAS)


def primera_admision(eventos: pd.DataFrame) -> pd.DataFrame:
    """NIT -> año de su primera admisión (cualquier familia), la familia y la precisión de ese evento."""
    e = eventos.sort_values(["nit", "anio_admision"]).drop_duplicates("nit")
    if "fecha_admision" not in e:
        e = e.assign(fecha_admision=pd.NaT)
    e = e.assign(fecha_admision=pd.to_datetime(e["fecha_admision"], errors="coerce"))
    return e.rename(columns={"anio_admision": "primera_admision", "familia": "familia_evento", "precision": "precision_evento",
                             "fecha_admision": "fecha_primera_admision"})[
        ["nit", "primera_admision", "familia_evento", "precision_evento", "fecha_primera_admision"]]


def _log10_positivo(s: pd.Series) -> pd.Series:
    return np.log10(s.where(s > 0))


def construir(data: Path = DATA, eventos: pd.DataFrame | None = None, ultimo_anio_eventos: int = ULTIMO_ANIO_EVENTOS) -> pd.DataFrame:
    gold = data / "gold"
    ind = pd.read_parquet(gold / "indicadores.parquet")
    par = pd.read_parquet(gold / "pares.parquet", columns=["nit", "anio", *PCT])
    sen = pd.read_parquet(gold / "senales.parquet")
    ea = pd.read_parquet(gold / "empresas_anio.parquet", columns=["nit", "anio", "grupo", "tipo_estado", "ciiu_division", "departamento", "fecha_constitucion"])
    alt = pd.read_parquet(data / "silver" / "altman.parquet")
    if eventos is None:
        eventos = pd.read_parquet(data / "silver" / "eventos_insolvencia.parquet")

    d = ind.merge(par, on=["nit", "anio"]).merge(sen[["nit", "anio", *SENALES, "n_senales"]], on=["nit", "anio"]).merge(
        ea, on=["nit", "anio"]).merge(alt, on=["nit", "anio"])
    d = d.sort_values(["nit", "anio"]).reset_index(drop=True)
    d["seccion"] = d["ciiu_division"].map(pares_.seccion_de_division())
    for s in SENALES:
        d[s] = d[s].astype("float64")  # verdadero = 1, falso = 0, no evaluable = vacío

    # Cambios frente al año anterior (solo si es el año inmediato anterior de la misma sociedad)
    previo = d[["nit", "anio", *DELTAS]].assign(anio=d["anio"] + 1)
    cruce = d[["nit", "anio"]].merge(previo, on=["nit", "anio"], how="left", suffixes=("", "_prev"))
    for c in DELTAS:
        d[f"delta_{c}"] = d[c] - cruce[c].to_numpy()

    d["log_activo"] = _log10_positivo(d["activo_total_real"].where(~d["atipico_unidades"]))
    d["log_ingresos"] = _log10_positivo(d["ingresos_real"].where(~d["atipico_unidades"]))
    constitucion = pd.to_datetime(d["fecha_constitucion"], errors="coerce")
    d["edad"] = (d["anio"] - constitucion.dt.year).where(lambda s: (s >= 0) & (s <= 200))
    d["n_reportes"] = d.groupby("nit").cumcount() + 1  # años que ha reportado hasta t (incluido)

    # Etiqueta y población
    pa = primera_admision(eventos)
    d = d.merge(pa, on="nit", how="left")
    d["ya_admitida"] = d["primera_admision"].le(d["anio"]).fillna(False)
    # `primera_admision` es un entero con nulos: sin evento la comparación no está definida, y eso es «no admitida» (0), no «sin dato»
    d["y"] = d["primera_admision"].between(d["anio"] + 1, d["anio"] + 2).fillna(False).astype("float64")
    d.loc[d["anio"] + 2 > ultimo_anio_eventos, "y"] = np.nan  # ventana de 24 meses incompleta: sin etiqueta

    # ¿Siguió reportando? (sesgo de supervivencia: muchas sociedades en problemas dejan de presentar estados)
    existe = set(zip(d["nit"], d["anio"], strict=True))
    ultimo = int(d["anio"].max())
    for k in (1, 2):
        d[f"sigue_t{k}"] = [(n, a + k) in existe if a + k <= ultimo else np.nan for n, a in zip(d["nit"], d["anio"], strict=True)]
    sigue = d[["sigue_t1", "sigue_t2"]].astype("float64")
    d["deja_de_reportar"] = np.where(sigue.isna().any(axis=1), np.nan, ((sigue["sigue_t1"] == 0) & (sigue["sigue_t2"] == 0)).astype(float))
    return d
