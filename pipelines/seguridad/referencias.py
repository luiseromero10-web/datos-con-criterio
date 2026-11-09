"""Genera data/ref/divipola.parquet y data/ref/poblacion.parquet."""
from pipelines.common.divipola import descargar_divipola, leer_poblacion
from pipelines.seguridad.config import DATA

if __name__ == "__main__":
    (DATA / "ref").mkdir(parents=True, exist_ok=True)
    d = descargar_divipola()
    d.to_parquet(DATA / "ref" / "divipola.parquet", index=False)
    p = leer_poblacion(str(DATA / "raw" / "PPED-AreaMun-2018-2042_VP.xlsx"))
    p.to_parquet(DATA / "ref" / "poblacion.parquet", index=False)
    print("divipola", len(d), "| poblacion", len(p), "municipios", p.cod_mpio.nunique(), "años", p.anio.min(), p.anio.max())
