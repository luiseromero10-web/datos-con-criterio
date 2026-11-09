"""Pruebas de consistencia del gold local (se omiten si aún no se generó data/)."""
from pathlib import Path

import duckdb
import pytest

GOLD = Path(__file__).resolve().parents[1] / "data" / "gold"
pytestmark = pytest.mark.skipif(not (GOLD / "hechos_mes_mpio.parquet").exists(), reason="gold no generado")


def _q(sql):
    return duckdb.connect().execute(sql).fetchall()


def test_mensual_y_semanal_suman_igual():
    m = _q(f"select sum(conteo) from '{(GOLD / 'hechos_mes_mpio.parquet').as_posix()}'")[0][0]
    s = _q(f"select sum(conteo) from '{(GOLD / 'hechos_semana_mpio.parquet').as_posix()}'")[0][0]
    assert m == s


def test_municipios_con_poblacion_y_codigo_valido():
    n_sin_pob, n_mal = _q(f"""select count(*) filter (where poblacion_2026 is null),
        count(*) filter (where length(cod_mpio) <> 5) from '{(GOLD / 'municipios.parquet').as_posix()}'""")[0]
    assert n_sin_pob == 0 and n_mal == 0


def test_sin_conteos_negativos_ni_tasas_nulas():
    n = _q(f"select count(*) from '{(GOLD / 'hechos_mes_mpio.parquet').as_posix()}' where conteo < 0 or tasa_100k is null")[0][0]
    assert n == 0
