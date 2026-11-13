"""Señales objetivas por sociedad y año (plan, sección 4.4), con redacción neutra.

Una señal es un hecho reportado, no un juicio sobre la empresa. Cada una puede ser verdadera, falsa o no evaluable (nula) cuando
falta el dato. `n_senales` cuenta las verdaderas y `n_evaluadas` las que se pudieron evaluar. Ninguna se combina en un puntaje.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class Senal:
    id: str
    texto: str  # lo que se muestra cuando es verdadera, en lenguaje neutro


SENALES: tuple[Senal, ...] = (
    Senal("patrimonio_negativo", "El patrimonio reportado es negativo."),
    Senal("perdidas_consecutivas", "La sociedad reportó pérdida neta este año y el anterior."),
    Senal("razon_corriente_menor_1", "La razón corriente reportada es menor que 1."),
    Senal("cobertura_menor_1", "La ganancia operacional reportada no alcanza a cubrir los costos financieros."),
    Senal("caida_ingresos_30", "Los ingresos, en pesos constantes, cayeron más de 30 % frente al año anterior."),
    Senal("opinion_no_limpia", "La opinión del revisor fiscal reportada no es «limpia» (con salvedad, negativa o abstención)."),
    Senal("estado_distinto_activa", "El estado registrado en la carátula es distinto de «ACTIVA»."),
)
IDS = tuple(s.id for s in SENALES)


def calcular(estados: pd.DataFrame, ind: pd.DataFrame, ea: pd.DataFrame) -> pd.DataFrame:
    """`estados`: gold/estados; `ind`: indicadores; `ea`: gold/empresas_anio (opinión y estado de la carátula)."""
    d = estados[["nit", "anio", "patrimonio", "ganancia_neta"]].merge(
        ind[["nit", "anio", "razon_corriente", "cobertura_intereses", "crecimiento_real_ingresos"]], on=["nit", "anio"], how="left").merge(
        ea[["nit", "anio", "opinion_revisor", "estado_actual"]], on=["nit", "anio"], how="left")
    previo = estados[["nit", "anio", "ganancia_neta"]].assign(anio=estados["anio"] + 1).rename(columns={"ganancia_neta": "neta_prev"})
    d = d.merge(previo, on=["nit", "anio"], how="left")
    b = pd.DataFrame({"nit": d["nit"], "anio": d["anio"]})

    def sobre(cond: pd.Series, existe: pd.Series) -> pd.Series:
        return pd.Series(cond.astype("boolean").where(existe), dtype="boolean")

    b["patrimonio_negativo"] = sobre(d["patrimonio"] < 0, d["patrimonio"].notna())
    perdida, perdida_prev = d["ganancia_neta"] < 0, d["neta_prev"] < 0
    # Sin pérdida este año no hay racha (falso); con pérdida, hace falta saber el año anterior
    b["perdidas_consecutivas"] = sobre(perdida & perdida_prev, d["ganancia_neta"].notna() & (~perdida | d["neta_prev"].notna()))
    b["razon_corriente_menor_1"] = sobre(d["razon_corriente"] < 1, d["razon_corriente"].notna())
    b["cobertura_menor_1"] = sobre(d["cobertura_intereses"] < 1, d["cobertura_intereses"].notna())
    b["caida_ingresos_30"] = sobre(d["crecimiento_real_ingresos"] < -0.30, d["crecimiento_real_ingresos"].notna())
    b["opinion_no_limpia"] = sobre(d["opinion_revisor"] != "limpio", d["opinion_revisor"].notna())
    b["estado_distinto_activa"] = sobre(d["estado_actual"] != "ACTIVA", d["estado_actual"].notna())
    marcas = b[list(IDS)]
    b["n_senales"] = marcas.sum(axis=1).astype("Int8")
    b["n_evaluadas"] = marcas.notna().sum(axis=1).astype("Int8")
    return b
