import numpy as np
import pandas as pd
import pytest

from pipelines.finanzas import catalogos
from pipelines.finanzas import indicadores as ind

COLUMNAS = ["ingresos", "ganancia_bruta", "costo_ventas", "ganancia_operacional", "ganancia_neta", "activo_total", "patrimonio",
            "activo_corriente", "pasivo_corriente", "inventarios_corriente", "pasivo_total", "costos_financieros", "cxc_corriente",
            "cxp_comerciales", "flujo_operacion", "ganancias_acumuladas"]

EMPRESA = {"ingresos": 1000.0, "ganancia_bruta": 400.0, "costo_ventas": 600.0, "ganancia_operacional": 100.0, "ganancia_neta": 50.0,
           "activo_total": 2000.0, "patrimonio": 800.0, "activo_corriente": 900.0, "pasivo_corriente": 450.0, "inventarios_corriente": 300.0,
           "pasivo_total": 1200.0, "costos_financieros": 20.0, "cxc_corriente": 200.0, "cxp_comerciales": 100.0, "flujo_operacion": 80.0,
           "ganancias_acumuladas": 500.0}


def estados(*filas):
    """filas: (nit, anio, {cambios sobre EMPRESA}); un valor None deja el rubro vacío."""
    datos = []
    for nit, anio, cambios in filas:
        f = {**EMPRESA, **cambios}
        datos.append({"nit": nit, "anio": anio, **{k: (np.nan if v is None else v) for k, v in f.items()}})
    return pd.DataFrame(datos).reindex(columns=["nit", "anio", *COLUMNAS])


def calcular(*filas):
    return ind.calcular(estados(*filas))[0].set_index(["nit", "anio"])


def test_indicadores_con_numeros_calculados_a_mano():
    r = calcular((1, 2024, {})).loc[(1, 2024)]
    esperado = {"margen_bruto": 0.4, "margen_operacional": 0.1, "margen_neto": 0.05, "roa": 0.025, "roe": 0.0625, "razon_corriente": 2.0,
                "prueba_acida": 600 / 450, "endeudamiento": 0.6, "apalancamiento": 1.5, "cobertura_intereses": 5.0,
                "dias_cartera": 200 / 1000 * 365, "dias_inventario": 300 / 600 * 365, "dias_proveedores": 100 / 600 * 365,
                "flujo_operacion_ingresos": 0.08}
    for k, v in esperado.items():
        assert r[k] == pytest.approx(v), k
    assert r["ciclo_caja"] == pytest.approx(73 + 182.5 - 365 / 6)
    assert pd.isna(r["margen_neto_motivo"])  # con valor no hay motivo


def test_denominador_no_positivo_da_nulo_con_motivo_y_nunca_infinito():
    r = calcular((1, 2024, {"patrimonio": 0.0, "ingresos": 0.0, "pasivo_corriente": -5.0, "activo_total": 0.0})).loc[(1, 2024)]
    for k, motivo in (("roe", "patrimonio_no_positivo"), ("apalancamiento", "patrimonio_no_positivo"), ("margen_neto", "sin_ingresos"),
                      ("razon_corriente", "sin_pasivo_corriente"), ("roa", "sin_activos"), ("endeudamiento", "sin_activos"),
                      ("dias_cartera", "sin_ingresos")):
        assert pd.isna(r[k]) and r[f"{k}_motivo"] == motivo, k
    assert r[list(ind.IDS)].replace([np.inf, -np.inf], np.nan).notna().sum() == r[list(ind.IDS)].notna().sum()  # sin infinitos


def test_patrimonio_negativo_no_da_roe_ni_apalancamiento_negativos_con_sentido_enganoso():
    r = calcular((1, 2024, {"patrimonio": -300.0})).loc[(1, 2024)]
    assert pd.isna(r["roe"]) and pd.isna(r["apalancamiento"])


def test_rubros_ausentes_donde_significan_cero():
    r = calcular((1, 2024, {"inventarios_corriente": None, "cxc_corriente": None, "cxp_comerciales": None})).loc[(1, 2024)]
    assert r["prueba_acida"] == pytest.approx(r["razon_corriente"])  # sin inventarios
    assert r["dias_inventario"] == 0 and r["dias_cartera"] == 0 and r["dias_proveedores"] == 0 and r["ciclo_caja"] == 0


def test_sin_costo_de_ventas_o_sin_costos_financieros_queda_vacio_con_su_motivo():
    r = calcular((1, 2024, {"costo_ventas": None, "ganancia_bruta": None, "costos_financieros": None})).loc[(1, 2024)]
    assert pd.isna(r["dias_inventario"]) and r["dias_inventario_motivo"] == "sin_costo_de_ventas"
    assert pd.isna(r["ciclo_caja"])
    assert pd.isna(r["cobertura_intereses"]) and r["cobertura_intereses_motivo"] == "sin_costos_financieros"
    assert pd.isna(r["margen_bruto"])  # no hay ganancia bruta ni costo de ventas para derivarla


def test_margen_bruto_se_deriva_del_costo_de_ventas_si_falta_la_ganancia_bruta():
    assert calcular((1, 2024, {"ganancia_bruta": None})).loc[(1, 2024), "margen_bruto"] == pytest.approx(0.4)


def test_crecimiento_real_descuenta_la_inflacion_del_dane():
    t = catalogos.ipc().set_index("anio")
    r = calcular((1, 2023, {"ingresos": 100.0}), (1, 2024, {"ingresos": 110.0}))
    esperado = (110 / t.loc[2024, "ipc_prom"]) / (100 / t.loc[2023, "ipc_prom"]) - 1
    assert r.loc[(1, 2024), "crecimiento_real_ingresos"] == pytest.approx(esperado)
    assert esperado < 0.10  # nominal +10 %; con inflación del 5,2 % queda cerca de +4,6 %
    assert pd.isna(r.loc[(1, 2023), "crecimiento_real_ingresos"]) and r.loc[(1, 2023), "crecimiento_real_ingresos_motivo"] == "sin_anio_anterior"


def test_crecimiento_requiere_el_anio_anterior_consecutivo():
    r = calcular((1, 2022, {}), (1, 2024, {}))
    assert r.loc[(1, 2024), "crecimiento_real_ingresos_motivo"] == "sin_anio_anterior"


def test_crecimiento_sin_ingresos_el_anio_anterior():
    r = calcular((1, 2023, {"ingresos": 0.0}), (1, 2024, {"ingresos": 50.0}))
    assert r.loc[(1, 2024), "crecimiento_real_ingresos_motivo"] == "sin_ingresos_anio_anterior"


def test_pesos_constantes_usan_ipc_promedio_para_flujos_y_de_diciembre_para_saldos():
    t = catalogos.ipc().set_index("anio")
    r = calcular((1, 2023, {}), (1, 2024, {}))
    assert r.loc[(1, 2024), "ingresos_real"] == pytest.approx(1000.0)  # el último año es la base
    assert r.loc[(1, 2023), "ingresos_real"] == pytest.approx(1000 * t.loc[2024, "ipc_prom"] / t.loc[2023, "ipc_prom"])
    assert r.loc[(1, 2023), "activo_total_real"] == pytest.approx(2000 * t.loc[2024, "ipc_dic"] / t.loc[2023, "ipc_dic"])


def test_falta_el_ipc_de_un_anio_falla_con_un_mensaje_claro():
    with pytest.raises(ValueError, match="Falta el IPC de \\[2099\\]"):
        ind.deflactores([2024, 2099])


def test_informe_en_otras_unidades_se_marca_y_no_contamina_el_crecimiento():
    filas = [(1, a, {"ingresos": 1e10, "activo_total": 2e10}) for a in (2021, 2022, 2024)]
    filas.insert(2, (1, 2023, {"ingresos": 1e13, "activo_total": 2e13}))  # mil veces más: error de unidades
    r = calcular(*filas)
    assert list(r["atipico_unidades"]) == [False, False, True, False]
    assert r.loc[(1, 2023), "crecimiento_real_ingresos_motivo"] == "posible_error_unidades"
    assert r.loc[(1, 2024), "crecimiento_real_ingresos_motivo"] == "posible_error_unidades"  # el año siguiente compara contra un valor raro
    assert pd.notna(r.loc[(1, 2022), "crecimiento_real_ingresos"])
    assert r.loc[(1, 2023), "ingresos_real"] > 1e12  # el valor reportado no se corrige ni se oculta (solo se marca)


def test_con_menos_de_tres_anios_no_se_declara_error_de_unidades():
    r = calcular((1, 2023, {"ingresos": 1e10}), (1, 2024, {"ingresos": 1e13}))
    assert not r["atipico_unidades"].any()


def test_altman_z2_con_numeros_a_mano_y_no_va_en_los_indicadores():
    e = estados((1, 2024, {}))
    out, alt = ind.calcular(e)
    x1, x2, x3, x4 = (900 - 450) / 2000, 500 / 2000, 100 / 2000, 800 / 1200
    z = 3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4
    assert z == pytest.approx(6.5766, abs=1e-3)
    assert alt.loc[0, "altman_z2"] == pytest.approx(z) and alt.loc[0, "altman_zona"] == "segura"  # z > 5,85
    assert not any("altman" in c for c in out.columns)  # es un puntaje individual de riesgo: no se publica


@pytest.mark.parametrize(("z_activo", "zona"), [(1, "alerta"), (0, None)])
def test_altman_zonas(z_activo, zona):
    e = estados((1, 2024, {"activo_total": 2000.0 * z_activo, "patrimonio": -5000.0 if z_activo else 800.0}))
    _, alt = ind.calcular(e)
    if zona is None:
        assert pd.isna(alt.loc[0, "altman_z2"])  # activo cero: no se calcula
    else:
        assert alt.loc[0, "altman_zona"] == zona


def test_sentido_de_los_indicadores():
    s = {i.id: i.sentido for i in ind.INDICADORES}
    assert s["endeudamiento"] == -1 and s["dias_cartera"] == -1 and s["roa"] == 1 and s["dias_proveedores"] == 0
    assert len(ind.IDS) == 16
