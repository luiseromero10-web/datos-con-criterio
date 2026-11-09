"""bronze -> silver -> gold con DuckDB."""
from __future__ import annotations

import duckdb

from pipelines.seguridad.config import DATA, DELITOS


def main() -> None:
    con = duckdb.connect()
    silver = DATA / "silver"
    gold = DATA / "gold"
    silver.mkdir(parents=True, exist_ok=True)
    gold.mkdir(parents=True, exist_ok=True)
    ref = DATA / "ref"

    # --- silver: tipos limpios, DIVIPOLA de 5 dÃ­gitos, un solo esquema para todos los delitos
    partes = []
    for delito in DELITOS:
        glob = (DATA / "bronze" / delito / "anio=*" / "mes=*.parquet").as_posix()
        partes.append(f"""
            SELECT '{delito}' AS delito,
                   CAST(CAST(fecha_hecho AS TIMESTAMP) AS DATE) AS fecha,
                   lpad(regexp_replace(CAST(cod_muni AS VARCHAR), '[.]0$', ''), 5, '0') AS cod_mpio,
                   TRY_CAST(cantidad AS INTEGER) AS cantidad
            FROM read_parquet('{glob}', union_by_name=true)
            WHERE fecha_hecho IS NOT NULL AND fecha_hecho <> 'nan'
        """)
    con.execute(f"COPY ({' UNION ALL '.join(partes)}) TO '{(silver / 'hechos.parquet').as_posix()}' (FORMAT PARQUET)")

    con.execute(f"CREATE VIEW h AS SELECT * FROM read_parquet('{(silver / 'hechos.parquet').as_posix()}')")
    con.execute(f"CREATE VIEW div AS SELECT * FROM read_parquet('{(ref / 'divipola.parquet').as_posix()}')")
    con.execute(f"CREATE VIEW pob AS SELECT * FROM read_parquet('{(ref / 'poblacion.parquet').as_posix()}')")

    # --- gold
    def exportar(sql: str, nombre: str) -> None:
        con.execute(f"COPY ({sql}) TO '{(gold / nombre).as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")

    exportar("""
        SELECT d.cod_mpio, d.municipio, d.cod_dpto, d.departamento, d.lon, d.lat,
               p.poblacion AS poblacion_2026
        FROM div d LEFT JOIN pob p ON p.cod_mpio = d.cod_mpio AND p.anio = 2026
        ORDER BY d.cod_mpio""", "municipios.parquet")

    for nombre, trunc in (("hechos_mes_mpio.parquet", "month"), ("hechos_semana_mpio.parquet", "week")):
        exportar(f"""
            SELECT date_trunc('{trunc}', h.fecha)::DATE AS periodo, h.cod_mpio, h.delito,
                   SUM(h.cantidad)::INTEGER AS conteo,
                   ROUND(SUM(h.cantidad) * 100000.0 / NULLIF(MAX(p.poblacion), 0), 3) AS tasa_100k
            FROM h
            JOIN div d ON d.cod_mpio = h.cod_mpio
            LEFT JOIN pob p ON p.cod_mpio = h.cod_mpio AND p.anio = year(h.fecha)
            GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""", nombre)
    print("silver y gold generados en", DATA)


if __name__ == "__main__":
    main()
