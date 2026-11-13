from datetime import date

import pandas as pd
import pandera.pandas as pa
import pytest

from pipelines.finanzas import conceptos as cp
from pipelines.finanzas import validaciones as val
from pipelines.finanzas.config import anios
from pipelines.finanzas.ingesta import corte_completo


def estados_ok(n=3, anio=2024):
    filas = []
    for i in range(n):
        f = {"nit": 800000000 + i, "anio": anio, "codigo_instancia": 100 + i, "grupo": "G2", "tipo_estado": "individual"}
        f.update({v: 1_000_000.0 for v in val.VARIABLES})
        filas.append(f)
    return pd.DataFrame(filas)


def test_estados_validos_pasan():
    val.esquema_estados([2024]).validate(estados_ok(), lazy=True)


@pytest.mark.parametrize("cambio", [
    {"activo_total": -1.0},  # activo negativo
    {"ingresos": 2e15},  # error de unidades
    {"grupo": "G3"},
    {"tipo_estado": "consolidado"},
    {"anio": 2010},
    {"nit": 0},
])
def test_estados_invalidos_fallan(cambio):
    df = estados_ok()
    for k, v in cambio.items():
        df.loc[0, k] = v
    with pytest.raises(pa.errors.SchemaErrors):
        val.esquema_estados([2024]).validate(df, lazy=True)


def test_estados_repetidos_fallan():
    df = pd.concat([estados_ok(2), estados_ok(1)], ignore_index=True)
    with pytest.raises(pa.errors.SchemaErrors):
        val.esquema_estados([2024]).validate(df, lazy=True)


def test_patrimonio_y_resultados_pueden_ser_negativos():
    df = estados_ok()
    df.loc[0, ["patrimonio", "ganancia_neta", "flujo_inversion"]] = -5e9
    val.esquema_estados([2024]).validate(df, lazy=True)


def test_dos_informes_elegidos_para_la_misma_sociedad_fallan():
    base = {"anio": 2024, "nit": 1, "tipo_estado": "individual", "grupo": "G1", "seleccionado": True}
    df = pd.DataFrame([{**base, "codigo_instancia": 1}, {**base, "codigo_instancia": 2}])
    assert val._problemas_esquema("informes", val.ESQUEMA_INFORMES, df)
    df.loc[1, "seleccionado"] = False
    assert not val._problemas_esquema("informes", val.ESQUEMA_INFORMES, df)


def test_volumen_detecta_saltos_pero_no_variaciones_normales():
    ok = pd.Series({2022: 31111, 2023: 31371, 2024: 29348})
    assert val.problemas_volumen(ok) == []
    caida = pd.Series({2023: 31371, 2024: 12000})
    assert "Volumen" in val.problemas_volumen(caida)[0]


def escribir_bronze(data, conjunto, anio, filas, columnas=None):
    ruta = data / "bronze" / conjunto / f"anio={anio}.parquet"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(filas, columns=columnas or val.COLUMNAS_BRONZE).to_parquet(ruta, index=False)


def bronze_completo(data, anio=2024, contacto=False):
    fila_num = ["1", "800000001", "2024-01-000001", "10", "Total de activos", "Periodo Actual", "100"]
    for c in ("esf", "eri", "efe"):
        escribir_bronze(data, c, anio, [fila_num])
    car = [["1", "800000001", "2024-01-000001", "10", cp.CAMPOS_CARATULA["razon_social"], "Periodo Actual", "X SAS"]]
    if contacto:
        car.append(["1", "800000001", "2024-01-000001", "10", "Teléfono del domicilio", "Periodo Actual", "3000000000"])
    escribir_bronze(data, "caratula", anio, car)


def test_bronze_completo_pasa(tmp_path):
    bronze_completo(tmp_path)
    assert val.validar_bronze(tmp_path, [2024]) == []


def test_bronze_detecta_archivo_faltante(tmp_path):
    bronze_completo(tmp_path)
    (tmp_path / "bronze" / "efe" / "anio=2024.parquet").unlink()
    assert any("falta efe 2024" in p for p in val.validar_bronze(tmp_path, [2024]))


def test_bronze_detecta_columnas_cambiadas_y_archivos_vacios(tmp_path):
    bronze_completo(tmp_path)
    escribir_bronze(tmp_path, "esf", 2024, [["1", "2"]], columnas=["a", "b"])
    escribir_bronze(tmp_path, "eri", 2024, [])
    p = val.validar_bronze(tmp_path, [2024])
    assert any("columnas inesperadas" in x for x in p) and any("sin filas" in x for x in p)


def test_bronze_detecta_valores_no_numericos(tmp_path):
    bronze_completo(tmp_path)
    escribir_bronze(tmp_path, "esf", 2024, [["1", "8", "r", "10", "Total de activos", "Periodo Actual", "abc"]])
    assert any("no son numéricos" in x for x in val.validar_bronze(tmp_path, [2024]))


def test_bronze_detecta_contacto_en_la_caratula(tmp_path):
    bronze_completo(tmp_path, contacto=True)
    assert any("lista blanca" in x for x in val.validar_bronze(tmp_path, [2024]))


@pytest.fixture
def validadores_vacios(monkeypatch):
    monkeypatch.setattr(val, "anios_presentes", lambda data: [2024])
    monkeypatch.setattr(val, "validar_bronze", lambda data, anios: [])
    monkeypatch.setattr(val, "validar_silver", lambda data: [])
    monkeypatch.setattr(val, "validar_gold", lambda data, anios: ([], ["aviso"], {"x": 1}))
    monkeypatch.setattr(val, "validar_fase3", lambda data, anios: [])
    monkeypatch.setattr(val, "validar_fase4", lambda data, anios: [])


def test_fallo_forzado(validadores_vacios, monkeypatch, tmp_path):
    monkeypatch.setenv("FORZAR_FALLO", "1")
    problemas, avisos, _ = val.validar(tmp_path)
    assert problemas == ["Fallo forzado (FORZAR_FALLO=1) para probar el flujo de alerta."] and avisos == ["aviso"]
    assert val.main(tmp_path) == 1
    assert "Validaciones fallidas" in (tmp_path / "validacion_reporte.md").read_text(encoding="utf-8")


def test_sin_fallo_no_hay_reporte(validadores_vacios, monkeypatch, tmp_path):
    monkeypatch.setenv("FORZAR_FALLO", "0")
    (tmp_path / "validacion_reporte.md").write_text("viejo", encoding="utf-8")
    assert val.main(tmp_path) == 0
    assert not (tmp_path / "validacion_reporte.md").exists()  # no queda un reporte de una corrida anterior


def test_si_falla_bronze_no_se_sigue(monkeypatch, tmp_path):
    monkeypatch.setattr(val, "anios_presentes", lambda data: [2024])
    monkeypatch.setattr(val, "validar_bronze", lambda data, anios: ["Bronze: falta algo."])
    llamado = []
    monkeypatch.setattr(val, "validar_silver", lambda data: llamado.append(1) or [])
    problemas, _, _ = val.validar(tmp_path)
    assert problemas == ["Bronze: falta algo."] and not llamado


def test_cortes_dinamicos():
    assert anios(date(2026, 11, 12)) == tuple(range(2016, 2026))
    assert anios(date(2027, 1, 15))[-1] == 2026


def test_un_corte_nuevo_entra_cuando_esta_completo():
    previo = pd.DataFrame({"informes": [25000, 3000]})
    assert corte_completo(pd.DataFrame({"informes": [20000, 2000]}), previo)
    assert not corte_completo(pd.DataFrame({"informes": [500, 100]}), previo)
    assert corte_completo(pd.DataFrame({"informes": [1]}), None)
