import numpy as np
import pandas as pd
import pytest

from pipelines.finanzas import pares, senales
from pipelines.finanzas.indicadores import IDS


def base(grupos: dict[str, int], anio=2024, ingresos=None):
    """Una sociedad por fila: `grupos` = {código CIIU de 4 dígitos (o None): cuántas sociedades}."""
    filas, nit = [], 1000
    for ciiu, n in grupos.items():
        for i in range(n):
            nit += 1
            filas.append({"nit": nit, "anio": anio, "ciiu_codigo": ciiu, "ingresos": float(i + 1) if ingresos is None else ingresos[i % len(ingresos)],
                          "activo_total": 10.0})
    return pd.DataFrame(filas)


def test_terciles_por_ingresos_dentro_del_grupo():
    b = pares.asignar(base({"4711": 90}))
    assert b["nivel_pares"].eq("ciiu4_tercil").all()
    assert b.groupby("tercil4").size().to_dict() == {1.0: 30, 2.0: 30, 3.0: 30}
    assert b.loc[b["ingresos"] <= 30, "tercil4"].eq(1).all() and b.loc[b["ingresos"] > 60, "tercil4"].eq(3).all()


def test_el_empate_se_rompe_de_forma_estable_y_sin_ingresos_cae_en_el_tercil_bajo():
    b1 = pares.asignar(base({"4711": 45}, ingresos=[0.0, 5.0, np.nan]))
    b2 = pares.asignar(base({"4711": 45}, ingresos=[0.0, 5.0, np.nan]).sample(frac=1, random_state=3))
    assert b1.set_index("nit")["tercil4"].equals(b2.set_index("nit")["tercil4"].reindex(b1["nit"]))  # mismo resultado con otro orden
    assert b1.groupby("tercil4").size().tolist() == [15, 15, 15]
    sin = b1[b1["ingresos"].isna() | (b1["ingresos"] == 0)]
    assert sin["tercil4"].isin([1, 2]).all() and len(sin) == 30  # los 30 sin ingresos ocupan los terciles bajos
    assert b1[b1["ingresos"] == 5.0]["tercil4"].eq(3).all()  # y los que sí tienen, el alto


def test_niveles_de_pares_y_respaldo():
    b = pares.asignar(base({"4711": 45, "4719": 30, "4721": 20, "5011": 10, None: 5}))
    por = b.groupby("ciiu4", dropna=False)["nivel_pares"].first()
    assert por["4711"] == "ciiu4_tercil"  # 45 en su clase
    assert por["4719"] == "ciiu2_tercil" and por["4721"] == "ciiu2_tercil"  # clase chica, pero la división 47 tiene 95
    assert por["5011"] == "ninguno"  # división con 10 sociedades
    assert b[b["ciiu_codigo"].isna()]["nivel_pares"].eq("ninguno").all()  # sin CIIU no hay pares


def test_division_de_tamano_intermedio_sin_terciles():
    b = pares.asignar(base({"4711": 10, "4719": 10, "4721": 10}))  # división 47 con 30
    assert b["nivel_pares"].eq("ciiu2").all()


def test_grupo_de_pares_etiqueta_y_tamano_cuentan_a_toda_la_division():
    b = pares.asignar(base({"4711": 45, "4719": 50}))
    g = pd.concat([b, pares.grupo_de_pares(b)], axis=1)
    grande = g[g["ciiu4"] == "4719"].iloc[0]
    assert grande["grupo_pares"].startswith("ciiu4_tercil:4719:T") and grande["n_pares"] >= 15
    chico = pares.asignar(base({"4711": 60, "4719": 30}))
    gc = pd.concat([chico, pares.grupo_de_pares(chico)], axis=1)
    fila = gc[gc["ciiu4"] == "4719"].iloc[0]
    assert fila["nivel_pares"] == "ciiu2_tercil" and fila["grupo_pares"].startswith("ciiu2_tercil:47:T")
    assert fila["n_pares"] == 30  # tercil de la división (90 / 3): cuenta también a las sociedades de la clase 4711


def indicadores(valores: dict[str, list[float]], anio=2024):
    n = len(next(iter(valores.values())))
    d = pd.DataFrame({"nit": range(1001, 1001 + n), "anio": anio})
    for i in IDS:
        d[i] = valores.get(i, [np.nan] * n)
    return d


def percentiles(valores, b=None, **kw):
    n = len(next(iter(valores.values())))
    b = pares.asignar(base({"4711": n}, **kw)) if b is None else b
    ind = indicadores(valores)
    return pares.percentiles(ind, b).set_index("nit")


def test_percentil_es_el_porcentaje_estrictamente_menor_cuando_mas_es_mejor():
    p = percentiles({"roa": [float(i) for i in range(1, 21)]})
    assert p["pct_roa"].iloc[0] == 0 and p["pct_roa"].iloc[-1] == 95  # nadie por debajo del menor; 19 de 20 por debajo del mayor
    assert p["pct_roa"].is_monotonic_increasing


def test_percentil_se_invierte_cuando_menos_es_mejor_y_no_cuando_es_neutral():
    v = [float(i) for i in range(1, 21)]
    p = percentiles({"endeudamiento": v, "dias_proveedores": v})
    assert p["pct_endeudamiento"].iloc[0] == 95 and p["pct_endeudamiento"].iloc[-1] == 0  # el menos endeudado es el mejor
    assert p["pct_dias_proveedores"].iloc[0] == 0 and p["pct_dias_proveedores"].iloc[-1] == 95  # neutral: posición simple


def test_percentil_empates_no_cuentan_como_por_debajo():
    p = percentiles({"roa": [1.0] * 20})
    assert p["pct_roa"].eq(0).all()


def test_un_valor_extremo_no_mueve_el_percentil_de_los_demas():
    v = [float(i) for i in range(1, 21)]
    p1 = percentiles({"roa": v})
    p2 = percentiles({"roa": [*v[:-1], 1e12]})
    assert p1["pct_roa"].iloc[:-1].equals(p2["pct_roa"].iloc[:-1])


def test_con_pocos_pares_no_hay_percentil_y_los_nulos_no_cuentan():
    pocos = percentiles({"roa": [float(i) for i in range(1, 15)]})  # 14 < 15
    assert pocos["pct_roa"].isna().all()
    con_nulos = percentiles({"roa": [*[float(i) for i in range(1, 15)], np.nan, np.nan, np.nan]})  # 17 sociedades, 14 con valor
    assert con_nulos["pct_roa"].isna().all()
    suficientes = percentiles({"roa": [*[float(i) for i in range(1, 16)], np.nan]})
    assert suficientes["pct_roa"].iloc[:15].notna().all() and pd.isna(suficientes["pct_roa"].iloc[15])


def test_los_anios_no_se_mezclan():
    b = pd.concat([pares.asignar(base({"4711": 45}, anio=2023)), pares.asignar(base({"4711": 45}, anio=2024)).assign(nit=lambda t: t["nit"] + 500)])
    ind = pd.concat([indicadores({"roa": [float(i) for i in range(45)]}, 2023),
                     indicadores({"roa": [float(i) * 1000 for i in range(45)]}, 2024).assign(nit=lambda t: t["nit"] + 500)])
    p = pares.percentiles(ind, b)
    a, c = p[p["anio"] == 2023].sort_values("nit"), p[p["anio"] == 2024].sort_values("nit")
    assert a["pct_roa"].tolist() == c["pct_roa"].tolist()  # misma forma: cada año se compara solo con su año


def test_nombre_de_sector_con_respaldo_si_la_clase_cambio_en_2022():
    assert "Comercio al por menor" in pares.nombre_ciiu("ciiu4", "4711")
    assert pares.nombre_ciiu("ciiu4", "7110") is not None  # clase de la CIIU anterior: usa el grupo 711
    assert pares.nombre_ciiu("ciiu2", "68") == "Actividades inmobiliarias"
    assert pares.nombre_ciiu("seccion", "L") == "ACTIVIDADES INMOBILIARIAS"


def sector_fixture():
    n = 40
    b = pares.asignar(base({"4711": n}))
    ind = indicadores({"roa": [float(i) for i in range(n)], "margen_operacional": [0.1] * n, "crecimiento_real_ingresos": [0.1] * n}, 2024)
    ind["ingresos_real"] = 100.0
    ind["atipico_unidades"] = False
    ind.loc[0, "atipico_unidades"] = True
    sen = pd.DataFrame({"nit": ind["nit"], "anio": 2024, "patrimonio_negativo": pd.array([False] * n, dtype="boolean")})
    est = pd.DataFrame({"nit": ind["nit"], "anio": 2024, "ingresos": 100.0, "activo_total": 50.0, "ganancia_neta": -1.0})
    return pares.vista_sector(ind, b, sen, est)


def test_vista_de_sector_excluye_informes_con_error_de_unidades_y_calcula_el_panel():
    q, r = sector_fixture()
    fila = r[(r["nivel"] == "ciiu4") & (r["codigo"] == "4711")].iloc[0]
    assert fila["n_empresas"] == 39 and fila["ingresos_total_real"] == pytest.approx(3900)
    assert fila["crecimiento_real_panel"] == pytest.approx(0.1)  # (100 / (100/1,1)) - 1 en cada sociedad
    assert fila["pct_perdida_neta"] == 1 and fila["pct_crece_rentable"] == 1 and fila["pct_patrimonio_negativo"] == 0
    assert "Comercio al por menor" in fila["nombre"]
    assert set(r["nivel"]) == {"ciiu4", "ciiu2", "seccion"}
    roa = q[(q["nivel"] == "ciiu4") & (q["indicador"] == "roa")].iloc[0]
    assert roa["n"] == 39 and roa["p50"] == pytest.approx(20.0) and roa["p05"] < roa["p25"] < roa["p50"] < roa["p75"] < roa["p95"]


def test_vista_de_sector_solo_publica_grupos_con_15_o_mas():
    n = 14
    b = pares.asignar(base({"4711": n}))
    ind = indicadores({"roa": [float(i) for i in range(n)]}, 2024).assign(ingresos_real=1.0, atipico_unidades=False)
    sen = pd.DataFrame({"nit": ind["nit"], "anio": 2024, "patrimonio_negativo": pd.array([False] * n, dtype="boolean")})
    est = pd.DataFrame({"nit": ind["nit"], "anio": 2024, "ingresos": 1.0, "activo_total": 1.0, "ganancia_neta": 1.0})
    q, r = pares.vista_sector(ind, b, sen, est)
    assert q.empty and r.empty


def test_las_senales_no_usan_lenguaje_de_riesgo_ni_de_quiebra():
    texto = " ".join(s.texto for s in senales.SENALES).lower()
    for palabra in ("quiebra", "riesgo", "insolven", "fraude", "mala", "peligro", "crisis"):
        assert palabra not in texto, palabra
