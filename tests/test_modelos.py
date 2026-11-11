"""Pruebas de métricas, intervalos y de la validación de predicciones."""
from datetime import date, timedelta

import duckdb
import numpy as np
import pytest

from models.seguridad.metricas import cobertura, intervalo, mase, puntaje_normalizado, wape
from pipelines.seguridad.validaciones import validar


def test_wape_perfecto_y_conocido():
    assert wape([10, 20], [10, 20]) == 0
    assert wape([10, 10], [8, 12]) == pytest.approx(0.2)


def test_mase_contra_escala():
    assert mase([10, 10], [12, 8], [2, 2]) == pytest.approx(1.0)


def test_cobertura():
    assert cobertura([1, 5, 10], [0, 0, 0], [2, 4, 11]) == pytest.approx(2 / 3)


def test_intervalo_nunca_negativo_y_ordenado():
    lo, hi = intervalo(np.array([0.0, 3.0, 50.0]), -2.5, 2.5)
    assert (lo >= 0).all() and (lo <= hi).all()


def test_conformal_cubre_cerca_del_nivel():
    rng = np.random.default_rng(0)
    yhat = rng.uniform(1, 40, 20000)
    y = rng.poisson(yhat)
    z = puntaje_normalizado(y, yhat)
    ql, qh = np.quantile(z, [0.1, 0.9])
    lo, hi = intervalo(yhat, ql, qh)
    assert 0.77 < cobertura(y, lo, hi) < 0.86


def _gold_minimo(tmp_path, p10=1.0, p50=2.0, p90=3.0, semanas=16):
    (tmp_path / "silver").mkdir(); (tmp_path / "gold").mkdir()
    ini = date(2026, 1, 5)
    con = duckdb.connect()
    con.execute("create table s(delito varchar, fecha date, cod_mpio varchar, cantidad integer)")
    con.execute("create table w(periodo date, cod_mpio varchar, delito varchar, conteo integer, tasa_100k double)")
    con.execute("create table m(periodo date, cod_mpio varchar, delito varchar, conteo integer, tasa_100k double)")
    for i in range(12):
        d = ini + timedelta(weeks=i)
        con.execute("insert into s values ('homicidio', ?, '05001', 100)", [d + timedelta(days=6)])
        con.execute("insert into w values (?, '05001', 'homicidio', 100, 1.0)", [d])
    con.execute("insert into m select date_trunc('month', periodo)::date, cod_mpio, delito, sum(conteo)::int, 1.0 from w group by 1,2,3")
    con.execute("create table mu(cod_mpio varchar)"); con.execute("insert into mu values ('05001')")
    con.execute("create table p(periodo date, nivel varchar, cod varchar, delito varchar, h integer, p10 double, p50 double, p90 double, tipo varchar)")
    for i in range(semanas):
        con.execute("insert into p values (?, 'mpio', '05001', 'homicidio', ?, ?, ?, ?, 'futuro')", [ini + timedelta(weeks=12 + i), i + 1, p10, p50, p90])
    for t, f in (("s", "silver/hechos"), ("w", "gold/hechos_semana_mpio"), ("m", "gold/hechos_mes_mpio"),
                 ("mu", "gold/municipios"), ("p", "gold/predicciones")):
        con.execute(f"copy {t} to '{(tmp_path / (f + '.parquet')).as_posix()}' (format parquet)")
    return tmp_path, ini + timedelta(weeks=12)


def test_predicciones_validas_pasan(tmp_path):
    base, hoy = _gold_minimo(tmp_path)
    assert validar(str(base), hoy=hoy) == []


def test_predicciones_con_intervalo_invertido_alertan(tmp_path):
    base, hoy = _gold_minimo(tmp_path, p10=5.0, p50=2.0, p90=3.0)
    assert any("Predicciones" in p for p in validar(str(base), hoy=hoy))
