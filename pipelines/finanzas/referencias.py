"""Genera data/finanzas/ref/divipola.parquet (catálogo de municipios) con el cliente común de DIVIPOLA."""
from pipelines.common.divipola import descargar_divipola
from pipelines.finanzas.config import DATA

if __name__ == "__main__":
    (DATA / "ref").mkdir(parents=True, exist_ok=True)
    d = descargar_divipola()
    d.to_parquet(DATA / "ref" / "divipola.parquet", index=False)
    print("divipola:", len(d), "municipios")
