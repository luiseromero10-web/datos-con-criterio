"""Indicadores financieros (plan, sección 4.3) con división segura, y valores en pesos constantes.

Reglas
- Sin infinitos: si el denominador falta o no es positivo, el indicador queda nulo y se anota el motivo en `<indicador>_motivo`.
- Los valores mostrados nunca se recortan. Los percentiles se calculan por rangos (`pares.py`), así que un extremo no los distorsiona.
- Rubro ausente = cero solo donde significa «no aplica» (inventarios, cuentas por cobrar y por pagar comerciales, ganancias acumuladas).
  Ingresos, costo de ventas y costos financieros ausentes dejan el indicador nulo con su motivo.
- Razones y márgenes son fracciones (0,12 = 12 %); los días son días de 365.
- Altman Z'' se calcula pero NO se publica: es un puntaje individual de riesgo (decisión del autor, plan 0.2). Va a silver, como
  línea base del modelo de la Fase 4.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from pipelines.finanzas import catalogos

DIAS = 365


@dataclass(frozen=True)
class Indicador:
    id: str
    nombre: str
    unidad: str  # fraccion | veces | dias
    formula: str
    sentido: int  # +1 más es mejor, -1 menos es mejor, 0 sin sentido único (se informa la posición, sin invertir)
    nota: str = ""


INDICADORES: tuple[Indicador, ...] = (
    Indicador("margen_bruto", "Margen bruto", "fraccion", "ganancia bruta / ingresos", +1,
              "Si no se reporta la ganancia bruta, ingresos − costo de ventas."),
    Indicador("margen_operacional", "Margen operacional", "fraccion", "ganancia operacional / ingresos", +1),
    Indicador("margen_neto", "Margen neto", "fraccion", "ganancia neta / ingresos", +1),
    Indicador("roa", "Rentabilidad del activo (ROA)", "fraccion", "ganancia neta / activo total", +1,
              "Con el activo de cierre, no el promedio."),
    Indicador("roe", "Rentabilidad del patrimonio (ROE)", "fraccion", "ganancia neta / patrimonio", +1,
              "Solo con patrimonio positivo."),
    Indicador("razon_corriente", "Razón corriente", "veces", "activo corriente / pasivo corriente", +1),
    Indicador("prueba_acida", "Prueba ácida", "veces", "(activo corriente − inventarios) / pasivo corriente", +1),
    Indicador("endeudamiento", "Endeudamiento", "fraccion", "pasivo total / activo total", -1),
    Indicador("apalancamiento", "Apalancamiento", "veces", "pasivo total / patrimonio", -1, "Solo con patrimonio positivo."),
    Indicador("cobertura_intereses", "Cobertura de intereses", "veces", "ganancia operacional / costos financieros", +1,
              "Sin costos financieros no hay cobertura que medir (no es infinita)."),
    Indicador("dias_cartera", "Días de cartera", "dias", "cuentas por cobrar comerciales / ingresos × 365", -1),
    Indicador("dias_inventario", "Días de inventario", "dias", "inventarios / costo de ventas × 365", -1),
    Indicador("dias_proveedores", "Días de proveedores", "dias", "cuentas por pagar comerciales / costo de ventas × 365", 0,
              "Más días = paga más lento: no es mejor ni peor por sí mismo."),
    Indicador("ciclo_caja", "Ciclo de conversión de caja", "dias", "días de cartera + días de inventario − días de proveedores", -1),
    Indicador("crecimiento_real_ingresos", "Crecimiento real de ingresos", "fraccion",
              "ingresos / ingresos del año anterior, ambos en pesos constantes, − 1", +1,
              "Requiere el año anterior de la misma sociedad."),
    Indicador("flujo_operacion_ingresos", "Flujo de operación sobre ingresos", "fraccion", "flujo de operación / ingresos", +1,
              "No existe en 2016: el flujo de efectivo de ese año se excluyó de la fuente."),
)
IDS = tuple(i.id for i in INDICADORES)

MOTIVOS = {
    "sin_dato": "No hay dato reportado para calcularlo.",
    "sin_ingresos": "La sociedad no reportó ingresos de actividades ordinarias positivos.",
    "sin_activos": "El activo total reportado no es positivo.",
    "patrimonio_no_positivo": "El patrimonio reportado no es positivo.",
    "sin_pasivo_corriente": "No reportó pasivo corriente.",
    "sin_pasivos": "No reportó pasivos.",
    "sin_costos_financieros": "No reportó costos financieros.",
    "sin_costo_de_ventas": "No reportó costo de ventas.",
    "sin_anio_anterior": "No hay informe del año anterior.",
    "sin_ingresos_anio_anterior": "El año anterior no reportó ingresos positivos.",
    "posible_error_unidades": "El informe de este año o del anterior parece estar en otras unidades (valores unas mil veces distintos de los demás años de la sociedad).",
}

UMBRAL_UNIDADES = 2.7  # órdenes de magnitud (≈ 500 veces) frente a la mediana de la propia sociedad
MIN_ANIOS_UNIDADES = 3  # con menos años no se puede saber cuál es el raro


def razon(num: pd.Series, den: pd.Series, motivo_den: str, den_ausente_es_motivo: bool = False) -> tuple[pd.Series, pd.Series]:
    """num / den sin infinitos. (valor, motivo): sin dato -> `sin_dato`; denominador <= 0 -> `motivo_den`.

    Con `den_ausente_es_motivo`, un denominador que no se reportó también se explica con `motivo_den` (p. ej. «sin ingresos»).
    """
    valor = pd.Series(np.nan, index=num.index, dtype="float64")
    motivo = pd.Series(pd.NA, index=num.index, dtype="string")
    hay = num.notna() & den.notna()
    motivo[~hay] = "sin_dato"
    if den_ausente_es_motivo:
        motivo[den.isna()] = motivo_den
    motivo[hay & (den <= 0)] = motivo_den
    ok = hay & (den > 0)
    valor[ok] = num[ok] / den[ok]
    return valor, motivo


def _cero(s: pd.Series) -> pd.Series:
    return s.fillna(0.0)


def atipico_unidades(e: pd.DataFrame) -> pd.Series:
    """Sociedad-año con ingresos o activo ≈ mil veces distintos de la mediana de sus propios años: casi seguro un informe en otras unidades.

    La fuente trae algunos (p. ej. ingresos de 47 billones un año y 49 mil millones al siguiente). No se corrigen ni se ocultan los
    valores reportados; solo se excluyen de las sumas por sector y del crecimiento, que serían absurdos.
    """
    flag = pd.Series(False, index=e.index)
    n_anios = e.groupby("nit")["anio"].transform("count")
    for col in ("ingresos", "activo_total"):
        logaritmo = np.log10(e[col].where(e[col] > 0))
        desviacion = logaritmo - logaritmo.groupby(e["nit"]).transform("median")
        flag |= desviacion.abs() >= UMBRAL_UNIDADES
    return flag & (n_anios >= MIN_ANIOS_UNIDADES)


def deflactores(anios: list[int]) -> pd.DataFrame:
    """Factores para llevar pesos de cada año a pesos del último año: flujos con el IPC promedio, saldos con el de diciembre."""
    t = catalogos.ipc().set_index("anio")
    faltan = sorted(set(anios) - set(t.index))
    if faltan:
        raise ValueError(f"Falta el IPC de {faltan} en pipelines/finanzas/referencia/ipc_anual.csv (ver catalogos.py).")
    base = max(anios)
    return pd.DataFrame({
        "anio": anios,
        "factor_flujo": [t.loc[base, "ipc_prom"] / t.loc[a, "ipc_prom"] for a in anios],
        "factor_saldo": [t.loc[base, "ipc_dic"] / t.loc[a, "ipc_dic"] for a in anios],
    })


def calcular(e: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(indicadores, altman). `e` es gold/estados.parquet (pesos corrientes). Indicadores no incluye el Altman."""
    e = e.sort_values(["nit", "anio"]).reset_index(drop=True)
    anios = sorted(int(a) for a in e["anio"].unique())
    d = deflactores(anios)
    e = e.merge(d, on="anio", how="left")
    out = e[["nit", "anio"]].copy()
    out["atipico_unidades"] = atipico_unidades(e)

    gb = e["ganancia_bruta"].where(e["ganancia_bruta"].notna(), e["ingresos"] - e["costo_ventas"])
    v: dict[str, tuple[pd.Series, pd.Series]] = {}

    v["margen_bruto"] = razon(gb, e["ingresos"], "sin_ingresos", True)
    v["margen_operacional"] = razon(e["ganancia_operacional"], e["ingresos"], "sin_ingresos", True)
    v["margen_neto"] = razon(e["ganancia_neta"], e["ingresos"], "sin_ingresos", True)
    v["roa"] = razon(e["ganancia_neta"], e["activo_total"], "sin_activos")
    v["roe"] = razon(e["ganancia_neta"], e["patrimonio"], "patrimonio_no_positivo")
    v["razon_corriente"] = razon(e["activo_corriente"], e["pasivo_corriente"], "sin_pasivo_corriente")
    v["prueba_acida"] = razon(e["activo_corriente"] - _cero(e["inventarios_corriente"]), e["pasivo_corriente"], "sin_pasivo_corriente")
    v["endeudamiento"] = razon(e["pasivo_total"], e["activo_total"], "sin_activos")
    v["apalancamiento"] = razon(e["pasivo_total"], e["patrimonio"], "patrimonio_no_positivo")
    costos_fin = e["costos_financieros"].where(e["costos_financieros"].notna() & (e["costos_financieros"] > 0))
    v["cobertura_intereses"] = razon(e["ganancia_operacional"], costos_fin.fillna(0), "sin_costos_financieros")
    cartera, m_cartera = razon(_cero(e["cxc_corriente"]).where(e["ingresos"].notna()), e["ingresos"], "sin_ingresos", True)
    inventario, m_inv = razon(_cero(e["inventarios_corriente"]).where(e["costo_ventas"].notna()), e["costo_ventas"], "sin_costo_de_ventas", True)
    proveedores, m_prov = razon(_cero(e["cxp_comerciales"]).where(e["costo_ventas"].notna()), e["costo_ventas"], "sin_costo_de_ventas", True)
    v["dias_cartera"] = (cartera * DIAS, m_cartera)
    v["dias_inventario"] = (inventario * DIAS, m_inv)
    v["dias_proveedores"] = (proveedores * DIAS, m_prov)
    ciclo = v["dias_cartera"][0] + v["dias_inventario"][0] - v["dias_proveedores"][0]
    m_ciclo = m_cartera.where(m_cartera.notna(), m_inv.where(m_inv.notna(), m_prov))
    v["ciclo_caja"] = (ciclo, m_ciclo)
    v["flujo_operacion_ingresos"] = razon(e["flujo_operacion"], e["ingresos"], "sin_ingresos", True)

    # Crecimiento real de ingresos: el año anterior de la misma sociedad, ambos en pesos de un mismo año (IPC promedio)
    real = (e["ingresos"] * e["factor_flujo"]).where(e["ingresos"] > 0)
    previo = e[["nit", "anio"]].assign(real_prev=real, anio=e["anio"] + 1)
    cruce = e[["nit", "anio"]].merge(previo, on=["nit", "anio"], how="left", indicator=True)
    tiene_prev = (cruce["_merge"] == "both").to_numpy()
    real_prev = cruce["real_prev"]
    previo_atipico = e[["nit", "anio"]].assign(anio=e["anio"] + 1, a=out["atipico_unidades"].to_numpy()).merge(
        e[["nit", "anio"]], on=["nit", "anio"], how="right")["a"].fillna(False).astype(bool).to_numpy()
    raro = out["atipico_unidades"].to_numpy() | previo_atipico
    ok = real.notna() & real_prev.notna() & (real_prev > 0) & ~raro
    crec = pd.Series(np.nan, index=e.index, dtype="float64")
    crec[ok] = real[ok] / real_prev[ok] - 1
    m_crec = pd.Series(pd.NA, index=e.index, dtype="string")
    m_crec[~ok & real_prev.isna() & tiene_prev] = "sin_ingresos_anio_anterior"
    m_crec[~tiene_prev] = "sin_anio_anterior"
    m_crec[real.isna()] = "sin_ingresos"
    m_crec[raro & real.notna() & tiene_prev] = "posible_error_unidades"
    v["crecimiento_real_ingresos"] = (crec, m_crec)

    for i in IDS:
        valor, motivo = v[i]
        out[i] = valor.astype("float64")
        out[f"{i}_motivo"] = motivo.where(valor.isna()).astype("string")

    # Pesos constantes (pesos del último año): flujos con el IPC promedio, saldos con el de diciembre
    out["ingresos_real"] = e["ingresos"] * e["factor_flujo"]
    out["ganancia_neta_real"] = e["ganancia_neta"] * e["factor_flujo"]
    out["activo_total_real"] = e["activo_total"] * e["factor_saldo"]
    out["patrimonio_real"] = e["patrimonio"] * e["factor_saldo"]
    return out, altman(e)


def altman(e: pd.DataFrame) -> pd.DataFrame:
    """Z'' de Altman para mercados emergentes (1995): 3,25 + 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4. Solo línea base; no se publica.

    X1 = capital de trabajo / activo; X2 = ganancias acumuladas / activo; X3 = ganancia operacional / activo;
    X4 = patrimonio / pasivo total. Zonas publicadas por Altman: > 5,85 segura, 4,35–5,85 gris, < 4,35 de alerta.
    """
    act = e["activo_total"].where(e["activo_total"] > 0)
    pas = e["pasivo_total"].where(e["pasivo_total"] > 0)
    x1 = (e["activo_corriente"] - e["pasivo_corriente"]) / act
    x2 = _cero(e["ganancias_acumuladas"]) / act
    x3 = e["ganancia_operacional"] / act
    x4 = e["patrimonio"] / pas
    z = 3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4
    zona = pd.Series(pd.NA, index=e.index, dtype="string")
    zona[z > 5.85] = "segura"
    zona[(z >= 4.35) & (z <= 5.85)] = "gris"
    zona[z < 4.35] = "alerta"
    return pd.DataFrame({"nit": e["nit"], "anio": e["anio"], "altman_z2": z.astype("float64"), "altman_zona": zona})
