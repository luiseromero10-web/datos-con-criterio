import json
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.finanzas import analisis, senales
from pipelines.finanzas import conceptos as cp
from pipelines.finanzas import validaciones as val
from pipelines.finanzas.calidad import contacto
from pipelines.finanzas.indicadores import IDS


def entrada(filas):
    """filas: dicts con nit, anio y los campos que se quieran; el resto queda vacío."""
    base = {"patrimonio": 10.0, "ganancia_neta": 5.0, "razon_corriente": 2.0, "cobertura_intereses": 3.0,
            "crecimiento_real_ingresos": 0.1, "opinion_revisor": "limpio", "estado_actual": "ACTIVA"}
    d = pd.DataFrame([{**base, **f} for f in filas]).replace({None: np.nan})
    e = d[["nit", "anio", "patrimonio", "ganancia_neta"]]
    ind = d[["nit", "anio", "razon_corriente", "cobertura_intereses", "crecimiento_real_ingresos"]]
    ea = d[["nit", "anio", "opinion_revisor", "estado_actual"]]
    return senales.calcular(e, ind, ea).set_index(["nit", "anio"])


def test_sociedad_sin_senales():
    s = entrada([{"nit": 1, "anio": 2024}]).loc[(1, 2024)]
    assert s["n_senales"] == 0 and s["n_evaluadas"] == 7
    assert not s[list(senales.IDS)].astype(bool).any()


def test_cada_senal_se_activa_con_su_condicion():
    casos = {"patrimonio_negativo": {"patrimonio": -1.0}, "razon_corriente_menor_1": {"razon_corriente": 0.99},
             "cobertura_menor_1": {"cobertura_intereses": 0.5}, "caida_ingresos_30": {"crecimiento_real_ingresos": -0.31},
             "opinion_no_limpia": {"opinion_revisor": "con salvedad"}, "estado_distinto_activa": {"estado_actual": "ACUERDO DE REORGANIZACIÓN"}}
    for nombre, cambio in casos.items():
        s = entrada([{"nit": 1, "anio": 2024, **cambio}]).loc[(1, 2024)]
        assert bool(s[nombre]) is True and s["n_senales"] == 1, nombre


def test_los_umbrales_son_estrictos():
    s = entrada([{"nit": 1, "anio": 2024, "razon_corriente": 1.0, "cobertura_intereses": 1.0, "crecimiento_real_ingresos": -0.30}]).loc[(1, 2024)]
    assert s["n_senales"] == 0  # exactamente 1, 1 y −30 % no activan la señal


def test_perdidas_consecutivas_exige_dos_anios_seguidos():
    s = entrada([{"nit": 1, "anio": 2023, "ganancia_neta": -1.0}, {"nit": 1, "anio": 2024, "ganancia_neta": -2.0},
                 {"nit": 2, "anio": 2023, "ganancia_neta": 3.0}, {"nit": 2, "anio": 2024, "ganancia_neta": -2.0},
                 {"nit": 3, "anio": 2022, "ganancia_neta": -1.0}, {"nit": 3, "anio": 2024, "ganancia_neta": -2.0},  # años no consecutivos
                 {"nit": 4, "anio": 2024, "ganancia_neta": -2.0},  # sin año anterior: no se puede saber
                 {"nit": 5, "anio": 2024, "ganancia_neta": 2.0}])  # ganancia: seguro que no hay racha
    p = s["perdidas_consecutivas"]
    assert bool(p[(1, 2024)]) is True
    assert bool(p[(2, 2024)]) is False and bool(p[(5, 2024)]) is False
    assert pd.isna(p[(3, 2024)]) and pd.isna(p[(4, 2024)])


def test_dato_ausente_deja_la_senal_sin_evaluar_y_no_la_cuenta():
    s = entrada([{"nit": 1, "anio": 2024, "razon_corriente": None, "opinion_revisor": None, "patrimonio": None}]).loc[(1, 2024)]
    assert pd.isna(s["razon_corriente_menor_1"]) and pd.isna(s["opinion_no_limpia"]) and pd.isna(s["patrimonio_negativo"])
    assert s["n_senales"] == 0 and s["n_evaluadas"] == 4


def sintetico(tmp_path: Path, n=60, anios=(2023, 2024)) -> Path:
    """Un gold mínimo (estados y empresas_anio) con 60 sociedades de una sola clase CIIU."""
    data = tmp_path / "finanzas"
    (data / "gold").mkdir(parents=True)
    (data / "silver").mkdir()
    rng = np.random.default_rng(1)
    filas, empresas = [], []
    for i in range(n):
        for a in anios:
            ing = float(rng.integers(1_000, 1_000_000)) * 1e3
            f = {"nit": 800_000_000 + i, "anio": a, "codigo_instancia": 1, "grupo": "G2", "tipo_estado": "individual", "ingresos": ing,
                 "ganancia_bruta": ing * 0.3, "costo_ventas": ing * 0.7, "ganancia_operacional": ing * 0.05, "ganancia_neta": ing * (0.02 - 0.04 * (i % 7 == 0)),
                 "activo_total": ing * 2, "patrimonio": ing * 0.8, "activo_corriente": ing, "pasivo_corriente": ing * 0.5, "pasivo_total": ing * 1.2,
                 "inventarios_corriente": ing * 0.1, "cxc_corriente": ing * 0.2, "cxp_comerciales": ing * 0.1, "costos_financieros": ing * 0.01,
                 "flujo_operacion": ing * 0.04, "ganancias_acumuladas": ing * 0.3}
            filas.append(f)
            empresas.append({"nit": f["nit"], "anio": a, "ciiu_codigo": "4711", "opinion_revisor": "limpio", "estado_actual": "ACTIVA"})
    todo = pd.DataFrame(filas)
    for v in {r.variable for r in cp.RUBROS} - set(todo.columns):
        todo[v] = np.nan
    todo.to_parquet(data / "gold" / "estados.parquet", index=False)
    pd.DataFrame(empresas).to_parquet(data / "gold" / "empresas_anio.parquet", index=False)
    return data


def test_analisis_escribe_todas_las_tablas_sin_altman_ni_contacto(tmp_path):
    data = sintetico(tmp_path)
    analisis.main(data)
    for f in analisis.ARCHIVOS_FASE3:
        assert (data / "gold" / f).exists(), f
    assert (data / "silver" / "altman.parquet").exists()
    for f in (data / "gold").glob("*.parquet"):
        columnas = pd.read_parquet(f).columns
        assert not [c for c in columnas if "altman" in c.lower()], f.name  # el puntaje de riesgo no se publica
    assert contacto(data) == []
    cat = json.loads((data / "gold" / "catalogos.json").read_text(encoding="utf-8"))
    assert len(cat["indicadores"]) == 16 and len(cat["senales"]) == 7 and cat["pesos_constantes"]["anio_base"] == 2024
    assert "altman" not in json.dumps(cat).lower()


def test_analisis_resultados_coherentes(tmp_path):
    data = sintetico(tmp_path)
    analisis.main(data)
    g = data / "gold"
    ind, par = pd.read_parquet(g / "indicadores.parquet"), pd.read_parquet(g / "pares.parquet")
    assert len(ind) == len(par) == 120 and not ind.duplicated(["nit", "anio"]).any()
    assert ind[list(IDS)].replace([np.inf, -np.inf], np.nan).equals(ind[list(IDS)])  # ningún infinito
    assert (par["nivel_pares"] == "ciiu4_tercil").all() and par["n_pares"].between(15, 60).all() and par["tercil"].isin([1, 2, 3]).all()
    pc = [c for c in par.columns if c.startswith("pct_")]
    assert len(pc) == 16 and par[pc].dropna(how="all").stack().between(0, 100).all()
    r = pd.read_parquet(g / "sector_resumen.parquet")
    assert {"ciiu4", "ciiu2", "seccion"} == set(r["nivel"]) and (r["n_empresas"] == 60).all()
    # orden por NIT y año: el sitio lee una ficha con pocas peticiones de rango
    assert ind[["nit", "anio"]].equals(ind[["nit", "anio"]].sort_values(["nit", "anio"]).reset_index(drop=True))


def test_las_validaciones_de_la_fase_3_aceptan_el_gold_sintetico_y_detectan_una_tabla_ausente(tmp_path):
    data = sintetico(tmp_path)
    analisis.main(data)
    assert val.validar_fase3(data, [2023, 2024]) == []
    (data / "gold" / "sector_resumen.parquet").unlink()
    assert "faltan" in val.validar_fase3(data, [2023, 2024])[0]
    analisis.main(data)
    assert val.validar_fase3(data, [2023, 2024, 2099]) != []  # falta el IPC de 2099
