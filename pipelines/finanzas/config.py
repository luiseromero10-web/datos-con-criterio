"""Configuración de la Radiografía Financiera. Fuentes y decisiones: docs/finanzas/fuentes.md y decisiones.md."""
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data" / "finanzas"

ANIOS = tuple(range(2016, 2026))  # 2015 queda fuera: solo Grupo 1 y sin flujo de efectivo (fuentes.md, sección 3)

# Conjuntos de la Supersociedades en datos.gov.co (CC BY-SA 4.0)
CONJUNTOS = {
    "caratula": "6hqw-m3dm",
    "esf": "pfdp-zks5",  # estado de situación financiera
    "eri": "prwj-nzxa",  # estado de resultado integral
    "efe": "ctcp-462n",  # estado de flujo de efectivo
}
ESTADOS = ("esf", "eri", "efe")
GRANDES = "6cat-2gcs"  # 10 000 empresas más grandes: solo para conciliar

UNIDAD_FUENTE = 1000  # `valor` viene en miles de pesos; en silver y gold todo va en pesos
PAGINA = 50_000
HILOS = 3  # consultas en paralelo a la API

# Informes que se conservan: individuales de Grupo 1 y Grupo 2 y, solo si no hay individual, separados.
TIPOS_ESTADO = ("individual", "separado")
