"""Genera data/ref/divipola.parquet y data/ref/poblacion.parquet."""
import requests

from pipelines.common.divipola import descargar_divipola, leer_poblacion
from pipelines.seguridad.config import DATA

URL_POBLACION = "https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Municipal/PPED-AreaMun-2018-2042_VP.xlsx"


if __name__ == "__main__":
    (DATA / "ref").mkdir(parents=True, exist_ok=True)
    d = descargar_divipola()
    d.to_parquet(DATA / "ref" / "divipola.parquet", index=False)
    xlsx = DATA / "raw" / "PPED-AreaMun-2018-2042_VP.xlsx"
    if not xlsx.exists():
        xlsx.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(URL_POBLACION, timeout=120)
        r.raise_for_status()
        xlsx.write_bytes(r.content)
    p = leer_poblacion(str(xlsx))
    p.to_parquet(DATA / "ref" / "poblacion.parquet", index=False)
    print("divipola", len(d), "| poblacion", len(p), "municipios", p.cod_mpio.nunique(), "años", p.anio.min(), p.anio.max())
