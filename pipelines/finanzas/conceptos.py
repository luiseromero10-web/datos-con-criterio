"""Mapeo de rubros de la Supersociedades a variables estándar (docs/finanzas/matriz_rubros.md).

La API devuelve «�» en lugar de las vocales con tilde y la eñe: la letra se pierde. Por eso la comparación usa una
**clave** que quita el «�» y también las letras acentuadas de los dos lados («pérdida» y «p�rdida» dan «prdida»).
Los nombres de los rubros cambian de un año a otro (2017 tiene otra taxonomía), así que cada variable admite varios alias.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from functools import cache

_ACENTUADAS = re.compile("[áéíóúüñ]")


def clave(texto: str) -> str:
    """Clave de comparación: sin «�», sin letras acentuadas, en minúsculas y con espacios simples."""
    t = unicodedata.normalize("NFC", str(texto)).lower().replace("�", "")
    return re.sub(r"\s+", " ", _ACENTUADAS.sub("", t)).strip()


def patron_soql(texto: str) -> str:
    """Patrón `LIKE` de SoQL para un rubro: cada letra acentuada (o «�») se vuelve un comodín `_`."""
    t = unicodedata.normalize("NFC", texto).replace("�", "_")
    return _ACENTUADAS.sub("_", t).replace("'", "''")


@dataclass(frozen=True)
class Rubro:
    variable: str
    estado: str  # esf | eri | efe | caratula
    alias: tuple[str, ...]  # el primero tiene prioridad si un informe trae varios
    signo: int = 1  # -1 donde la fuente invierte el signo
    nota: str = ""


# --- Estados financieros (valores en miles de pesos en la fuente)
RUBROS: tuple[Rubro, ...] = (
    # Situación financiera
    Rubro("activo_total", "esf", ("Total de activos", "Activos")),
    Rubro("activo_corriente", "esf", ("Activos corrientes totales", "Activos corrientes")),
    Rubro("efectivo", "esf", ("Efectivo y equivalentes al efectivo",)),
    Rubro("cxc_corriente", "esf", ("Cuentas comerciales por cobrar y otras cuentas por cobrar corrientes",)),
    Rubro("inventarios_corriente", "esf", ("Inventarios corrientes",)),
    Rubro("ppe", "esf", ("Propiedades, planta y equipo",)),
    Rubro("pasivo_total", "esf", ("Total pasivos", "Pasivos")),
    Rubro("pasivo_corriente", "esf", ("Pasivos corrientes totales", "Pasivos corrientes")),
    Rubro("of_otros_corriente", "esf", ("Otros pasivos financieros corrientes",)),
    Rubro("of_otros_no_corriente", "esf", ("Otros pasivos financieros no corrientes",)),
    Rubro("of_prestamos_corriente", "esf", ("Préstamos corrientes",), nota="solo Grupo 2"),
    Rubro("of_parte_corriente_lp", "esf", ("Parte corriente de préstamos no corrientes",), nota="solo Grupo 2"),
    Rubro("of_parte_no_corriente_lp", "esf", ("Parte no corriente de préstamos no corrientes",), nota="solo Grupo 2"),
    Rubro(
        "cxp_comerciales",
        "esf",
        (
            "Cuentas por pagar comerciales y otras cuentas por pagar corrientes",  # 2021-2025
            "Cuentas por pagar comerciales y otras cuentas por pagar",  # 2015-2020
        ),
    ),
    Rubro("patrimonio", "esf", ("Patrimonio total", "Patrimonio")),
    Rubro("ganancias_acumuladas", "esf", ("Ganancias acumuladas",)),
    # Resultado integral
    Rubro("ingresos", "eri", ("Ingresos de actividades ordinarias",)),
    Rubro("otros_ingresos", "eri", ("Otros ingresos",), nota="6cat-2gcs suma ingresos ordinarios y otros ingresos"),
    Rubro("costo_ventas", "eri", ("Costo de ventas",)),
    Rubro("ganancia_bruta", "eri", ("Ganancia bruta",)),
    Rubro("gastos_administracion", "eri", ("Gastos de administración",)),
    Rubro("gastos_venta", "eri", ("Gastos de ventas", "Costos de distribución")),
    Rubro("ganancia_operacional", "eri", ("Ganancia (pérdida) por actividades de operación",)),
    Rubro("ingresos_financieros", "eri", ("Ingresos financieros",)),
    Rubro("costos_financieros", "eri", ("Costos financieros",)),
    Rubro("ganancia_antes_impuestos", "eri", ("Ganancia (pérdida), antes de impuestos",)),
    Rubro("impuesto", "eri", ("Ingreso (gasto) por impuestos",)),
    Rubro(
        "impuesto",
        "eri",
        ("Gasto (ingreso) por impuestos, operaciones continuadas",),
        signo=-1,
        nota="taxonomía 2017: signo invertido",
    ),
    Rubro("ganancia_neta", "eri", ("Ganancia (pérdida)",)),
    # Flujo de efectivo
    Rubro(
        "flujo_operacion",
        "efe",
        (
            "Flujos de efectivo netos procedentes de (utilizados en) actividades de operación",
            "Flujos de efectivo procedentes de (utilizados en) actividades de operación",  # 2017
        ),
    ),
    Rubro(
        "flujo_inversion",
        "efe",
        (
            "Flujos de efectivo netos procedentes de (utilizados en) actividades de inversión",
            "Flujos de efectivo procedentes de (utilizados en) actividades de inversión",
        ),
    ),
    Rubro(
        "flujo_financiacion",
        "efe",
        (
            "Flujos de efectivo netos procedentes de (utilizados en) actividades de financiación",
            "Flujos de efectivo procedentes de (utilizados en) actividades de financiación",
        ),
    ),
    Rubro(
        "depreciacion_amortizacion",
        "efe",
        (
            "( + ) Ajustes por gastos de depreciación y amortización",
            "(+) Ajustes por gastos de depreciación y amortización",
            "Ajustes por gastos de depreciación y amortización",
        ),
    ),
)

# Variables que el plan llama «núcleo» (sección 4.2 y criterio de la Fase 1)
NUCLEO = (
    "activo_total",
    "pasivo_total",
    "patrimonio",
    "activo_corriente",
    "pasivo_corriente",
    "ingresos",
    "ganancia_operacional",
    "ganancia_neta",
)

# --- Carátula: lista blanca. Solo se descargan estos campos; los datos de contacto
# (teléfono, celular, correos, direcciones, notificaciones) no se piden nunca.
CAMPOS_CARATULA: dict[str, str] = {
    "razon_social": "Razón social de la sociedad",
    "ciiu_texto": "Clasificación Industrial Internacional Uniforme Versión 4 A.C (CIIU)",
    "ciudad": "Ciudad de la dirección del domicilio",
    "departamento": "Departamento de la dirección del domicilio",
    "tipo_societario": "Tipo societario",
    "fecha_constitucion": "Fecha de constitución (Aaaa-Mm-Dd)",
    "estado_actual": "Estado actual",
    "opinion_revisor": "Concepto del Revisor fiscal en su informe",
    "obligada_revisor": "La compañía está obligada a tener Revisor fiscal?",
    "reexpresion": "Estos estados financieros presentan información reexpresada?",
    "regimen_especial": "La sociedad es",
}

# Palabras que delatan datos de contacto: ninguna columna ni rubro publicado puede contenerlas (prueba automática).
PROHIBIDAS_CONTACTO = ("telefono", "celular", "e-mail", "email", "correo", "direccion", "notificacion")


def rubros_de(estado: str) -> list[Rubro]:
    return [r for r in RUBROS if r.estado == estado]


@cache
def tabla_mapeo() -> dict[tuple[str, str], tuple[str, int, int]]:
    """(estado, clave del rubro) -> (variable, signo, prioridad)."""
    mapa: dict[tuple[str, str], tuple[str, int, int]] = {}
    for r in RUBROS:
        for prioridad, alias in enumerate(r.alias):
            k = (r.estado, clave(alias))
            if k in mapa and mapa[k][0] != r.variable:
                raise ValueError(f"Alias repetido en dos variables: {alias!r}")
            mapa[k] = (r.variable, r.signo, prioridad)
    return mapa


def mapear(estado: str, concepto: str) -> tuple[str, int, int] | None:
    return tabla_mapeo().get((estado, clave(concepto)))


def patrones_soql(estado: str) -> list[str]:
    """Patrones `LIKE` (únicos) de los rubros que se piden a la API para un estado financiero."""
    vistos: dict[str, None] = {}
    for r in rubros_de(estado):
        for a in r.alias:
            vistos[patron_soql(a)] = None
    return list(vistos)


def patrones_soql_caratula() -> list[str]:
    return [patron_soql(v) for v in CAMPOS_CARATULA.values()]
