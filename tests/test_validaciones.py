"""Pruebas de las validaciones con un mini-gold sintético (no usan data/ real)."""
from datetime import date, timedelta

import duckdb

from pipelines.seguridad.validaciones import validar


def _armar(tmp_path, conteos_por_semana, ultimo_dia=None):
    """Crea silver/gold mínimos: un municipio, un delito (homicidio), una fila por semana."""
    base = tmp_path
    (base / "silver").mkdir(); (base / "gold").mkdir()
    ini = date(2026, 1, 5)  # lunes
    filas = [(ini + timedelta(weeks=i), n) for i, n in enumerate(conteos_por_semana)]
    ultimo = ultimo_dia or (filas[-1][0] + timedelta(days=6))
    con = duckdb.connect()
    con.execute("create table s(delito varchar, fecha date, cod_mpio varchar, cantidad integer)")
    con.execute("create table w(periodo date, cod_mpio varchar, delito varchar, conteo integer, tasa_100k double)")
    con.execute("create table m(periodo date, cod_mpio varchar, delito varchar, conteo integer, tasa_100k double)")
    for p, n in filas:
        con.execute("insert into s values ('homicidio', ?, '05001', ?)", [min(p, ultimo), n])
        con.execute("insert into w values (?, '05001', 'homicidio', ?, 1.0)", [p, n])
    con.execute("insert into m select date_trunc('month', periodo)::date, cod_mpio, delito, sum(conteo)::int, 1.0 from w group by 1,2,3")
    con.execute("create table mu(cod_mpio varchar)"); con.execute("insert into mu values ('05001')")
    for t, f in (("s", "silver/hechos"), ("w", "gold/hechos_semana_mpio"), ("m", "gold/hechos_mes_mpio"), ("mu", "gold/municipios")):
        con.execute(f"copy {t} to '{(base / (f + '.parquet')).as_posix()}' (format parquet)")
    return base, ultimo


def test_datos_sanos_pasan(tmp_path):
    base, ultimo = _armar(tmp_path, [100] * 12)
    assert validar(str(base), hoy=ultimo + timedelta(days=3)) == []


def test_caida_mayor_al_50_por_ciento_alerta(tmp_path):
    base, ultimo = _armar(tmp_path, [100] * 8 + [30] + [100] * 5)
    problemas = validar(str(base), hoy=ultimo + timedelta(days=3))
    assert any("Volumen" in p for p in problemas)


def test_caida_en_semanas_provisionales_no_alerta(tmp_path):
    base, ultimo = _armar(tmp_path, [100] * 12 + [20, 10])
    assert not any("Volumen" in p for p in validar(str(base), hoy=ultimo + timedelta(days=3)))


def test_datos_viejos_alertan_frescura(tmp_path):
    base, ultimo = _armar(tmp_path, [100] * 12)
    assert any("Frescura" in p for p in validar(str(base), hoy=ultimo + timedelta(days=90)))


def test_fallo_forzado(tmp_path, monkeypatch):
    base, ultimo = _armar(tmp_path, [100] * 12)
    monkeypatch.setenv("FORZAR_FALLO", "1")
    assert any("forzado" in p for p in validar(str(base), hoy=ultimo + timedelta(days=3)))
