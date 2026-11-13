"""Pruebas del modelo de alerta: etiqueta, fuga de información, métricas, regla de selección, serialización y salida agregada."""
import itertools
import json

import numpy as np
import pandas as pd
import pytest

from models.finanzas import alerta, datos, metricas, puntuar
from models.finanzas.modelos import ModeloAltman, ModeloLgbm, ModeloLogit, Platt, logit, sigmoide
from pipelines.finanzas import analisis
from tests.finanzas.test_senales import sintetico

# ---------------------------------------------------------------- métricas


def test_recall_y_precision_en_el_top():
    y = np.array([1, 0, 0, 1, 0, 0, 0, 0, 0, 0])
    s = np.array([0.9, 0.1, 0.2, 0.8, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0])
    assert metricas.recall_en_top(y, s, 0.2) == 1.0  # los dos primeros puestos son los dos positivos
    assert metricas.precision_en_top(y, s, 0.2) == 1.0
    assert metricas.recall_en_top(y, -s, 0.2) == 0.0
    assert metricas.recall_en_top(y, s, 0.1) == 0.5  # k = 1 -> 1 de 2 positivos


def test_pr_auc_perfecta_y_aleatoria():
    y = np.array([0, 0, 0, 1, 1])
    assert metricas.pr_auc(y, np.array([0, 0.1, 0.2, 0.8, 0.9])) == 1.0
    rng = np.random.default_rng(0)
    yy = (rng.random(20000) < 0.02).astype(float)
    assert metricas.pr_auc(yy, rng.random(20000)) == pytest.approx(0.02, abs=0.01)  # sin información ≈ tasa base


def test_brier_y_su_habilidad_frente_a_predecir_la_tasa_base():
    y = np.array([1, 0, 0, 0])
    assert metricas.brier(y, np.full(4, 0.25)) == pytest.approx(0.1875)
    assert metricas.brier_skill(y, np.full(4, 0.25)) == pytest.approx(0.0)
    assert metricas.brier_skill(y, np.array([1, 0, 0, 0.0])) == pytest.approx(1.0)
    assert metricas.brier_skill(y, np.array([0.0, 1, 1, 1])) < 0


def test_curva_de_calibracion_y_error():
    rng = np.random.default_rng(1)
    p = rng.random(10000) * 0.1
    y = (rng.random(10000) < p).astype(float)  # bien calibrada por construcción
    assert metricas.error_calibracion(y, p) < 0.005
    mal = np.clip(p * 3, 0, 1)
    assert metricas.error_calibracion(y, mal) > 0.05
    c = metricas.curva_calibracion(y, p)
    assert len(c) == 10 and sum(g["n"] for g in c) == 10000 and all(a["prevista"] <= b["prevista"] for a, b in itertools.pairwise(c))


def test_probabilidad_de_mejora_pareada():
    rng = np.random.default_rng(2)
    y = (rng.random(4000) < 0.05).astype(float)
    bueno, malo = y * 2 + rng.random(4000), rng.random(4000)
    assert metricas.prob_mejora(y, bueno, malo, repeticiones=100) > 0.95
    assert metricas.prob_mejora(y, malo, bueno, repeticiones=100) < 0.05


# ---------------------------------------------------------------- etiqueta, población y fuga de información


def eventos(*filas):
    columnas = ["nit", "anio_admision", "familia", "precision", "fecha_admision"]
    df = pd.DataFrame([{"nit": n, "anio_admision": a, "familia": "reorganizacion", "precision": "exacta", "fecha_admision": pd.NaT} for n, a in filas],
                      columns=columnas)
    return df.astype({"nit": "int64", "anio_admision": "Int64"})


@pytest.fixture
def gold(tmp_path):
    data = sintetico(tmp_path, n=40, anios=(2021, 2022, 2023, 2024, 2025))
    analisis.main(data)
    return data


def base_de(gold, ev):
    return datos.construir(gold, eventos=ev, ultimo_anio_eventos=2025).set_index(["nit", "anio"])


def test_etiqueta_es_admision_en_t_mas_1_o_t_mas_2(gold):
    n = 800_000_000
    b = base_de(gold, eventos((n, 2023), (n + 1, 2022), (n + 2, 2021), (n + 3, 2026)))
    assert b.loc[(n, 2021), "y"] == 1 and b.loc[(n, 2022), "y"] == 1  # admitida en 2023: positiva en los cierres 2021 (t+2) y 2022 (t+1)
    assert b.loc[(n, 2023), "ya_admitida"] and b.loc[(n, 2024), "ya_admitida"] and not b.loc[(n, 2022), "ya_admitida"]  # desde ahí ya no es población
    assert b.loc[(n + 1, 2021), "y"] == 1 and b.loc[(n + 1, 2022), "ya_admitida"]  # admitida en 2022
    assert b.loc[(n + 2, 2021), "ya_admitida"] and b.loc[(n + 2, 2021), "y"] == 0  # admitida en el año del cierre: ya en proceso y fuera de la ventana
    assert b.loc[(n + 5, 2021), "y"] == 0 and not b.loc[(n + 5, 2021), "ya_admitida"]  # sin evento: negativa
    assert b.loc[(n + 3, 2023), "y"] == 0  # admitida en 2026: fuera de la ventana de 2023 (2024–2025)


def test_sin_etiqueta_cuando_la_ventana_de_24_meses_no_esta_completa(gold):
    b = base_de(gold, eventos((800_000_000, 2025)))
    assert b.loc[(800_000_001, 2023), "y"] == 0
    assert pd.isna(b.loc[(800_000_001, 2024), "y"]) and pd.isna(b.loc[(800_000_001, 2025), "y"])  # t+2 pasa del último año de eventos


def test_quienes_dejan_de_reportar_se_marcan_aparte(gold):
    sin = pd.read_parquet(gold / "gold" / "estados.parquet")
    sin = sin[~((sin["nit"] == 800_000_007) & (sin["anio"] > 2022))]  # deja de reportar tras 2022
    sin.to_parquet(gold / "gold" / "estados.parquet", index=False)
    ind = pd.read_parquet(gold / "gold" / "indicadores.parquet")
    for f in ("indicadores", "pares", "senales", "empresas_anio"):
        t = pd.read_parquet(gold / "gold" / f"{f}.parquet")
        t[~((t["nit"] == 800_000_007) & (t["anio"] > 2022))].to_parquet(gold / "gold" / f"{f}.parquet", index=False)
    del ind
    b = base_de(gold, eventos())
    assert b.loc[(800_000_007, 2022), "deja_de_reportar"] == 1 and b.loc[(800_000_007, 2022), "sigue_t1"] == 0
    assert b.loc[(800_000_008, 2022), "deja_de_reportar"] == 0
    assert pd.isna(b.loc[(800_000_008, 2025), "deja_de_reportar"])  # no se sabe si seguirá


def test_las_variables_no_incluyen_nada_posterior_al_cierre(gold):
    assert "estado_distinto_activa" not in datos.VARIABLES and "estado_actual" not in datos.VARIABLES
    for prohibida in ("y", "ya_admitida", "primera_admision", "sigue_t1", "sigue_t2", "deja_de_reportar", "fecha_primera_admision"):
        assert prohibida not in datos.VARIABLES, prohibida


def test_prueba_de_fuga_cambiar_el_futuro_no_cambia_las_variables_de_t(gold):
    antes = base_de(gold, eventos())
    # Se altera por completo lo que reporta la sociedad en 2023, 2024 y 2025 (años posteriores a 2022)
    for f in ("estados", "empresas_anio"):
        t = pd.read_parquet(gold / "gold" / f"{f}.parquet")
        if f == "estados":
            m = t["anio"] > 2022
            for c in ("ingresos", "ganancia_neta", "activo_total", "patrimonio", "pasivo_total", "activo_corriente", "pasivo_corriente"):
                t.loc[m, c] = t.loc[m, c] * 7.3 + 1e6
        else:
            t.loc[t["anio"] > 2022, "opinion_revisor"] = "negativo"
            t.loc[t["anio"] > 2022, "estado_actual"] = "ACUERDO DE REORGANIZACIÓN"
        t.to_parquet(gold / "gold" / f"{f}.parquet", index=False)
    analisis.main(gold)  # recalcula indicadores, pares, percentiles y señales con el futuro alterado
    despues = base_de(gold, eventos())
    columnas = [c for c in datos.VARIABLES if c not in ("n_reportes",)]
    a, d = antes.loc[antes.index.get_level_values("anio") <= 2022, columnas], despues.loc[despues.index.get_level_values("anio") <= 2022, columnas]
    # Los percentiles del cierre 2022 se calculan con pares del mismo año, que no cambian; las variables de 2022 y anteriores deben coincidir
    pd.testing.assert_frame_equal(a.sort_index(), d.sort_index(), check_exact=False, rtol=1e-9, atol=1e-9)


# ---------------------------------------------------------------- modelos


def base_sintetica(n=500, anios=range(2016, 2025), seed=0):
    rng = np.random.default_rng(seed)
    filas = []
    for a in anios:
        roa, deuda = rng.normal(0.05, 0.1, n), rng.beta(2, 3, n)
        p = sigmoide(-4.5 - 14 * roa + 5 * deuda)
        z = 3.25 + 6.56 * (0.2 - deuda * 0.3) + 6.72 * roa
        filas.append(pd.DataFrame({
            "nit": np.arange(n) + a * 10_000, "anio": a, "y": (rng.random(n) < p).astype(float), "ya_admitida": False,
            "roa": roa, "endeudamiento": deuda, "altman_z2": z, "n_senales": rng.integers(0, 3, n).astype(float),
            "seccion": rng.choice(["C", "G", "L"], n), "departamento": rng.choice(["ANTIOQUIA", "BOGOTÁ, D.C."], n), "grupo": "G2", "tipo_estado": "individual",
            "familia_evento": np.where(rng.random(n) < 0.8, "reorganizacion", "liquidacion"), "precision_evento": "exacta",
            "fecha_primera_admision": pd.NaT, "deja_de_reportar": 0.0, "log_ingresos": rng.normal(9, 1, n)}))
    d = pd.concat(filas, ignore_index=True)
    for c in datos.NUMERICAS:
        if c not in d:
            d[c] = np.nan
    return d


def test_el_pipeline_de_entrenamiento_aprende_y_supera_a_no_saber_nada():
    base = base_sintetica()
    res = alerta.entrenar(base, ventanas={"2016-2019": (2016, 2017, 2018, 2019)}, con_intervalos=False)
    prueba = res["metricas"]["logit"]["prueba"]
    assert prueba["pr_auc"] > 2.5 * prueba["tasa_base"] and prueba["roc_auc"] > 0.75 and prueba["brier_skill"] > 0
    assert res["metricas"]["logit"]["prueba"]["pr_auc"] > res["metricas"]["altman"]["prueba"]["pr_auc"] * 0.9  # el Z'' sintético también tiene señal
    assert res["seleccion"]["publicado"] in ("altman", "logit", "lgbm")
    # nunca se mezclan años entre partes
    p = res["particiones"]
    assert set(p["entrenamiento"]["anio"]) <= {2016, 2017, 2018, 2019} and set(p["validacion"]["anio"]) == {2020, 2021}
    assert set(p["prueba"]["anio"]) == {2022} and set(p["prueba_2023"]["anio"]) == {2023}


def metr(pr_lgbm, pr_logit, pr_altman, rec=(0.4, 0.3, 0.2), pr_lgbm_2023=None, rec_2023=None, val=(0.08, 0.09, 0.02)):
    def r(pr, rc):
        return {"pr_auc": pr, "recall_5": rc, "brier": 0.01}
    pr2 = pr_lgbm_2023 if pr_lgbm_2023 is not None else pr_lgbm
    return {
        "lgbm": {"validacion": r(val[0], rec[0]), "prueba": r(pr_lgbm, rec[0]), "prueba_2023": r(pr2, rec_2023 if rec_2023 is not None else rec[0])},
        "logit": {"validacion": r(val[1], rec[1]), "prueba": r(pr_logit, rec[1]), "prueba_2023": r(pr_logit, rec[1])},
        "altman": {"validacion": r(val[2], rec[2]), "prueba": r(pr_altman, rec[2]), "prueba_2023": r(pr_altman, rec[2])},
    }


def test_regla_de_seleccion_adopta_lightgbm_solo_si_les_gana_en_la_prueba():
    assert alerta.elegir(metr(0.11, 0.09, 0.03))["publicado"] == "lgbm"
    assert alerta.elegir(metr(0.08, 0.09, 0.03))["publicado"] == "logit"  # pierde contra la logística en la prueba
    assert alerta.elegir(metr(0.11, 0.09, 0.03, rec=(0.25, 0.3, 0.2)))["publicado"] == "logit"  # mejor PR-AUC pero peor recall@5 %
    assert alerta.elegir(metr(0.11, 0.09, 0.03, pr_lgbm_2023=0.05))["publicado"] == "logit"  # pierde en la segunda prueba
    assert alerta.elegir(metr(0.11, 0.09, 0.03, val=(0.08, 0.01, 0.02)))["publicado"] == "lgbm"  # la validación no entra en la regla
    sel = alerta.elegir(metr(0.02, 0.01, 0.03, rec=(0.1, 0.1, 0.1), val=(0.05, 0.01, 0.04)))
    assert sel["publicado"] == "altman" and sel["mejor_linea_base_por_validacion"] == "altman"  # si Altman fuera la mejor línea base, se publica


def test_los_modelos_se_guardan_y_cargan_sin_perder_nada(tmp_path):
    base = base_sintetica(n=400)
    res = alerta.entrenar(base, ventanas={"v": (2016, 2017, 2018, 2019)}, con_intervalos=False)
    alerta.guardar(res, tmp_path)
    prueba = res["particiones"]["prueba"]
    m = res["modelos"]
    cargado_logit = ModeloLogit.de_json(json.loads((tmp_path / "logit.json").read_text()))
    cargado_altman = ModeloAltman.de_json(json.loads((tmp_path / "altman.json").read_text()))
    cargado_lgbm = ModeloLgbm.cargar(tmp_path)
    np.testing.assert_allclose(cargado_logit.probabilidad(prueba), m["logit"].probabilidad(prueba), rtol=1e-12)
    np.testing.assert_allclose(cargado_altman.probabilidad(prueba), m["altman"].probabilidad(prueba), rtol=1e-12)
    np.testing.assert_allclose(cargado_lgbm.probabilidad(prueba), m["lgbm"].probabilidad(prueba), rtol=1e-9)
    sel = json.loads((tmp_path / "seleccion.json").read_text(encoding="utf-8"))
    assert 0 < sel["umbral_perfil_alto"] < 1 and sel["ventana_entrenamiento"]["elegida"] == "v"


def test_platt_y_logit_son_inversos():
    p = np.array([0.001, 0.05, 0.5, 0.9])
    np.testing.assert_allclose(sigmoide(logit(p)), p)
    y = (np.random.default_rng(0).random(5000) < 0.1).astype(float)
    pl = Platt.ajustar(np.zeros(5000), y)
    assert pl(np.zeros(3))[0] == pytest.approx(0.1, abs=0.02)  # sin información, vuelve a la tasa base


def test_altman_sin_dato_no_tiene_probabilidad():
    d = pd.DataFrame({"altman_z2": [5.0, np.nan, -3.0]})
    p = ModeloAltman().ajustar(d.assign(), np.array([0.0, 0.0, 1.0])).probabilidad(d)
    assert np.isnan(p[1]) and p[2] > p[0]  # menor Z'' = mayor riesgo


# ---------------------------------------------------------------- salida agregada: nunca por sociedad


def para_agregar(n=200, anios=(2022, 2023)):
    rng = np.random.default_rng(3)
    filas = [pd.DataFrame({"nit": np.arange(n) + a * 1000, "anio": a, "p": rng.random(n) * 0.1, "seccion": rng.choice(["C", "G"], n, p=[0.9, 0.1]),
                           "ciiu_division": "47", "departamento": rng.choice(["ANTIOQUIA", "CAUCA"], n, p=[0.95, 0.05]),
                           "log_ingresos": rng.normal(9, 1, n), "estado_actual": "ACTIVA", "y": np.where(a == 2022, (rng.random(n) < 0.05).astype(float), np.nan)})
             for a in anios]
    d = pd.concat(filas, ignore_index=True)
    d["alto"] = d["p"] >= 0.08
    d["total"] = "nacional"
    d["ciiu2"] = d["ciiu_division"]
    d["tamano"] = d.groupby("anio")["log_ingresos"].transform(lambda s: pd.qcut(s.rank(method="first"), 3, labels=["bajo", "medio", "alto"])).astype("string")
    return d


def test_agregado_no_publica_grupos_chicos_ni_nit_ni_puntajes_individuales():
    d = para_agregar()
    out = puntuar.agregar(d)
    assert (out["n_empresas"] >= puntuar.MIN_GRUPO).all()
    assert "G" not in set(out.loc[out["dimension"] == "seccion", "codigo"]) or (out[(out["dimension"] == "seccion") & (out["codigo"] == "G")]["n_empresas"] >= 30).all()
    assert not ({"CAUCA"} & set(out.loc[out["dimension"] == "departamento", "codigo"]))  # ~10 sociedades por año: suprimido
    for prohibida in ("nit", "razon_social", "p"):
        assert prohibida not in out.columns
    assert out.loc[out["dimension"] == "total", "n_empresas"].tolist() == [200, 200]


def test_agregado_proporcion_con_perfil_alto_y_tasa_observada():
    d = para_agregar()
    out = puntuar.agregar(d)
    tot = out[(out["dimension"] == "total") & (out["anio"] == 2022)].iloc[0]
    assert tot["pct_perfil_alto"] == pytest.approx(d[d["anio"] == 2022]["alto"].mean())
    assert tot["p_media"] == pytest.approx(d[d["anio"] == 2022]["p"].mean())
    h = puntuar.agregar(d, con_etiqueta=True)
    assert set(h["anio"]) == {2022} and h.loc[h["dimension"] == "total", "tasa_observada"].iloc[0] == pytest.approx(d[d["anio"] == 2022]["y"].mean())


def test_muestra_de_cada_anio():
    assert [puntuar.muestra(a) for a in (2016, 2019, 2020, 2021, 2022, 2023, 2024)] == [
        "entrenamiento", "entrenamiento", "validacion", "validacion", "prueba", "prueba", "sin_etiqueta"]


def test_el_gold_agregado_de_punta_a_punta_con_el_modelo_guardado(gold, tmp_path):
    base = base_sintetica(n=300)
    res = alerta.entrenar(base, ventanas={"v": (2016, 2017, 2018, 2019)}, con_intervalos=False)
    alerta.guardar(res, tmp_path)
    (tmp_path / "metrics.json").write_text('{"metricas": {"lgbm": {"prueba": {"pr_auc": 0.1}}}}', encoding="utf-8")
    out = puntuar.main(gold, tmp_path)
    assert json.loads((gold / "gold" / "alerta_metricas.json").read_text(encoding="utf-8"))["metricas"]["lgbm"]["prueba"]["pr_auc"] == 0.1
    leido = pd.read_parquet(gold / "gold" / "alerta_agregada.parquet")
    assert len(out) == len(leido) and set(leido["dimension"]) <= set(puntuar.DIMENSIONES)
    assert "nit" not in leido.columns and (leido["n_empresas"] >= puntuar.MIN_GRUPO).all()
    assert leido["modelo"].nunique() == 1 and leido["umbral"].between(0, 1).all()


def test_la_validacion_de_la_fase_4_detecta_una_salida_que_se_pasa_de_publica(gold, tmp_path):
    from pipelines.finanzas import validaciones as val

    base = base_sintetica(n=300)
    res = alerta.entrenar(base, ventanas={"v": (2016, 2017, 2018, 2019)}, con_intervalos=False)
    alerta.guardar(res, tmp_path)
    (tmp_path / "metrics.json").write_text('{"metricas": {}}', encoding="utf-8")
    puntuar.main(gold, tmp_path)
    anios = [2021, 2022, 2023, 2024, 2025]
    assert val.validar_fase4(gold, anios, tmp_path) == []
    ruta = gold / "gold" / "alerta_agregada.parquet"
    original = pd.read_parquet(ruta)

    def con(df):
        df.to_parquet(ruta, index=False)
        return val.validar_fase4(gold, anios, tmp_path)

    assert any("no permitidas" in p for p in con(original.assign(nit=1)))  # un NIT en la salida
    assert any("no permitidas" in p for p in con(original.assign(p=0.5)))  # un puntaje individual
    assert any("menos de 30" in p for p in con(original.assign(n_empresas=original["n_empresas"].where(original.index != 0, 5))))
    assert any("0–1" in p for p in con(original.assign(pct_perfil_alto=1.5)))
    assert any("no coincide" in p for p in con(original.assign(modelo="altman" if original["modelo"].iloc[0] != "altman" else "logit")))
    assert any("todos los años" in p for p in con(original[original["anio"] != 2023]))
    con(original)  # restaura la salida buena
    met = gold / "gold" / "alerta_metricas.json"
    met.write_text('{"x": NaN}', encoding="utf-8")  # NaN no es JSON: el navegador no lo lee
    assert any("JSON válido" in p for p in val.validar_fase4(gold, anios, tmp_path))
    met.write_text('{"por_sociedad": [{"nit": 1}]}', encoding="utf-8")
    assert any("identificadores" in p for p in val.validar_fase4(gold, anios, tmp_path))
    met.unlink()
    assert any("falta alerta_metricas" in p for p in val.validar_fase4(gold, anios, tmp_path))
    ruta.unlink()
    assert "falta alerta_agregada" in val.validar_fase4(gold, anios, tmp_path)[0]
