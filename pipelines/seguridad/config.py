"""Conjuntos de la familia A (Observatorio MDN en datos.gov.co). Ver docs/fuentes.md."""
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"
ANIO_INICIO = 2018
MESES_A_REFRESCAR = 3  # registro tardío: se vuelven a descargar los últimos meses

# delito -> (id del conjunto, columnas extra que se conservan)
DELITOS = {
    "homicidio": "m8fd-ahd9",
    "lesiones": "jr6v-i33g",
    "hurto_personas": "4rxi-8m8d",
    "hurto_comercio": "7i2x-h5vp",
    "hurto_residencias": "7mn7-vzqp",
    "hurto_vehiculos": "csb4-y6v2",
}
