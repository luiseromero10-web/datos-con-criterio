"""Transformación bronze -> silver -> gold con datos sintéticos (sin red)."""
from datetime import date

import pandas as pd
import pytest

from pipelines.finanzas import conceptos as cp
from pipelines.finanzas import transformar as tr

COLS = ["codigo_instancia", "nit", "numero_radicado", "id_punto_entrada", "concepto", "periodo", "valor"]


def fila(inst, nit, rad, punto, concepto, periodo, valor):
    return [str(inst), str(nit), rad, str(punto), concepto, periodo, str(valor)]


def escribir(data, conjunto, anio, filas):
    ruta = data / "bronze" / conjunto / f"anio={anio}.parquet"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(filas, columns=COLS).astype(str).to_parquet(ruta, index=False)


def puntos(data, anio, filas):
    ruta = data / "bronze" / "puntos_entrada" / f"anio={anio}.parquet"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(filas, columns=["id_punto_entrada", "tipo", "grupo"]).assign(anio=anio).to_parquet(ruta, index=False)


CIIU = cp.CAMPOS_CARATULA["ciiu_texto"]
RAZON = cp.CAMPOS_CARATULA["razon_social"]
ESTADO = cp.CAMPOS_CARATULA["estado_actual"]
OPINION = cp.CAMPOS_CARATULA["opinion_revisor"]
REEXP = cp.CAMPOS_CARATULA["reexpresion"]


@pytest.fixture
def datos(tmp_path):
    data = tmp_path / "finanzas"
    A = "Periodo Actual"
    # ---- 2024: puntos 10 = individual G2, 11 = separado G2
    puntos(data, 2024, [(10, "individual", "G2"), (11, "separado", "G2")])
    esf, eri, car = [], [], []
    # NIT 1: individual (100) con filas repetidas, y separado (101) del mismo año
    for _ in range(2):  # la fuente repite las filas (caso 2022)
        esf += [fila(100, 1, "2024-01-000100", 10, "Total de activos", A, 5000),
                fila(100, 1, "2024-01-000100", 10, "Total pasivos", A, 3000),
                fila(100, 1, "2024-01-000100", 10, "Patrimonio total", A, 2000)]
    esf += [fila(100, 1, "2024-01-000100", 10, "Total de activos", "Periodo Anterior", 4000),
            fila(101, 1, "2024-02-000101", 11, "Total de activos", A, 9999)]
    # NIT 2: solo separado
    esf += [fila(110, 2, "2024-01-000110", 11, "Total de activos", A, 700)]
    # NIT 3: dos individuales (retransmisión): gana el radicado más reciente
    esf += [fila(200, 3, "2024-01-000200", 10, "Total de activos", A, 111),
            fila(201, 3, "2024-03-000201", 10, "Total de activos", A, 222)]
    # NIT 4: individual sin balance + separado con balance: gana el que tiene balance
    esf += [fila(301, 4, "2024-01-000301", 11, "Total de activos", A, 444)]
    car += [fila(300, 4, "2024-05-000300", 10, RAZON, A, "SIN BALANCE SAS")]
    # Resultado: ingresos con valor decimal inexistente y rubro desconocido
    eri += [fila(100, 1, "2024-01-000100", 10, "Ingresos de actividades ordinarias", A, 8000),
            fila(100, 1, "2024-01-000100", 10, "Ingreso (gasto) por impuestos", A, -150),
            fila(100, 1, "2024-01-000100", 10, "Algo que no se usa", A, 1)]
    # Carátula de NIT 1 elegido
    car += [fila(100, 1, "2024-01-000100", 10, RAZON, A, "EMPRESA UNO S.A.S."),
            fila(100, 1, "2024-01-000100", 10, ESTADO, A, "ACUERDO DE REESTRUCTURACI�N"),
            fila(100, 1, "2024-01-000100", 10, OPINION, A, "02. CON SALVEDAD"),
            fila(100, 1, "2024-01-000100", 10, REEXP, A, "true"),
            fila(100, 1, "2024-01-000100", 10, CIIU, A, "L6810 - Actividades inmobiliarias")]
    escribir(data, "esf", 2024, esf)
    escribir(data, "eri", 2024, eri)
    escribir(data, "efe", 2024, [])
    escribir(data, "caratula", 2024, car)

    # ---- 2017: taxonomía con el signo del impuesto invertido y periodo en fecha
    puntos(data, 2017, [(20, "individual", "G1")])
    escribir(data, "esf", 2017, [fila(500, 7, "2017-01-000500", 20, "Activos", "2017-dic-31", 1000),
                                 fila(500, 7, "2017-01-000500", 20, "Activos", "2016-dic-31", 900),
                                 fila(500, 7, "2017-01-000500", 20, "Pasivos", "2017-dic-31", 400),
                                 fila(500, 7, "2017-01-000500", 20, "Patrimonio", "2017-dic-31", 600)])
    # resultado y flujo de 2016-2017: el periodo es solo el año («2017») y el anterior «2016»; en el flujo de 2016 trae el NIT
    escribir(data, "eri", 2017, [fila(500, 7, "2017-01-000500", 20, "Gasto (ingreso) por impuestos, operaciones continuadas", "2017", 50),
                                 fila(500, 7, "2017-01-000500", 20, "Gasto (ingreso) por impuestos, operaciones continuadas", "2016", 999),
                                 fila(500, 7, "2017-01-000500", 20, "Ganancia (p�rdida)", "2017-S2", 777)])
    escribir(data, "efe", 2017, [fila(500, 7, "2017-01-000500", 20, "Flujos de efectivo procedentes de (utilizados en) actividades de operaci�n", "7", 123)])
    escribir(data, "caratula", 2017, [fila(500, 7, "2017-01-000500", 20, RAZON, "Periodo Actual", "VIEJA S.A.")])

    # ---- 2019 sin CIIU y 2020 con CIIU, misma sociedad (NIT 9): el CIIU se hereda
    for anio, ciiu in ((2019, None), (2020, "G4711 - Comercio al por menor")):
        puntos(data, anio, [(30, "individual", "G2")])
        escribir(data, "esf", anio, [fila(600 + anio, 9, f"{anio}-01-000600", 30, "Total de activos", "Periodo Actual", 1)])
        escribir(data, "eri", anio, [])
        escribir(data, "efe", anio, [])
        filas = [fila(600 + anio, 9, f"{anio}-01-000600", 30, RAZON, "Periodo Actual", "NUEVE")]
        if ciiu:
            filas.append(fila(600 + anio, 9, f"{anio}-01-000600", 30, CIIU, "Periodo Actual", ciiu))
        escribir(data, "caratula", anio, filas)

    ref = data / "ref"
    ref.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"cod_mpio": ["11001", "25126", "05001", "76001", "05615", "13001", "47001"],
                  "municipio": ["BOGOTÁ, D.C.", "CAJICÁ", "MEDELLÍN", "CALI", "RIONEGRO", "CARTAGENA DE INDIAS", "SANTA MARTA"],
                  "departamento": ["BOGOTÁ, D.C.", "CUNDINAMARCA", "ANTIOQUIA", "VALLE DEL CAUCA", "ANTIOQUIA", "BOLÍVAR", "MAGDALENA"]}).to_parquet(ref / "divipola.parquet")
    ciu, dep = cp.CAMPOS_CARATULA["ciudad"], cp.CAMPOS_CARATULA["departamento"]
    ruta = data / "bronze" / "caratula" / "anio=2024.parquet"
    extra = pd.DataFrame([fila(100, 1, "2024-01-000100", 10, ciu, A, "CAJICA-CUNDINAMARCA"), fila(100, 1, "2024-01-000100", 10, dep, A, "CUNDINAMARCA"),
                          fila(110, 2, "2024-01-000110", 11, ciu, A, "BOGOTA D.C."), fila(110, 2, "2024-01-000110", 11, dep, A, "BOGOT� D.C."),
                          fila(201, 3, "2024-03-000201", 10, ciu, A, "MEDELL�N"), fila(201, 3, "2024-03-000201", 10, dep, A, "ANTIOQUIA"),
                          fila(301, 4, "2024-01-000301", 11, ciu, A, "CIUDAD INVENTADA"), fila(301, 4, "2024-01-000301", 11, dep, A, "ANTIOQUIA"),
                          fila(500, 7, "2017-01-000500", 20, ciu, A, "X")], columns=COLS).iloc[:-1]
    extra = pd.concat([extra, pd.DataFrame([fila(110, 2, "2024-01-000110", 11, cp.CAMPOS_CARATULA["tipo_societario"], A, "08. SAS")], columns=COLS)])
    pd.concat([pd.read_parquet(ruta), extra]).astype(str).to_parquet(ruta, index=False)
    tr.construir_silver(data)
    tr.construir_gold(data)
    return data


def estados(data):
    return pd.read_parquet(data / "gold" / "estados.parquet").set_index(["nit", "anio"])


def test_valores_en_pesos_desde_miles_y_sin_duplicados(datos):
    e = estados(datos).loc[(1, 2024)]
    assert e["activo_total"] == 5_000_000  # miles -> pesos, no se suma el duplicado
    assert e["pasivo_total"] == 3_000_000
    assert e["patrimonio"] == 2_000_000
    assert e["ingresos"] == 8_000_000


def test_solo_periodo_actual(datos):
    assert estados(datos).loc[(1, 2024), "activo_total"] != 4_000_000  # «Periodo Anterior»
    assert estados(datos).loc[(7, 2017), "activo_total"] == 1_000_000  # la fecha 2016-dic-31 se ignora


def test_individual_gana_al_separado(datos):
    e = estados(datos).loc[(1, 2024)]
    assert e["tipo_estado"] == "individual" and e["codigo_instancia"] == 100


def test_si_solo_hay_separado_se_usa_el_separado(datos):
    e = estados(datos).loc[(2, 2024)]
    assert e["tipo_estado"] == "separado" and e["activo_total"] == 700_000


def test_retransmision_gana_el_radicado_mas_reciente(datos):
    e = estados(datos).loc[(3, 2024)]
    assert e["codigo_instancia"] == 201 and e["activo_total"] == 222_000


def test_informe_sin_balance_pierde_ante_uno_con_balance(datos):
    e = estados(datos).loc[(4, 2024)]
    assert e["codigo_instancia"] == 301 and e["tipo_estado"] == "separado"
    inf = pd.read_parquet(datos / "silver" / "informes.parquet")
    perdedor = inf[inf["codigo_instancia"] == 300].iloc[0]
    assert not perdedor["seleccionado"] and perdedor["motivo_descarte"] == "sin balance"


def test_un_informe_por_sociedad_y_anio(datos):
    inf = pd.read_parquet(datos / "silver" / "informes.parquet")
    elegidos = inf[inf["seleccionado"]]
    assert not elegidos.duplicated(["nit", "anio"]).any()
    assert len(inf) - len(elegidos) == 3  # 101 (separado), 200 (retransmitido) y 300 (sin balance)


def test_periodo_con_solo_el_anio_y_flujo_ambiguo(datos):
    e = estados(datos).loc[(7, 2017)]
    assert e["impuesto"] == -50_000  # «2017» sí, «2016» (anterior) no
    assert pd.isna(e["flujo_operacion"])  # periodo = NIT (defecto de la fuente en el flujo de 2016): ambiguo, se excluye
    assert pd.isna(e["ganancia_neta"])  # «2017-S2» (semestre) no es el periodo anual


def test_signo_del_impuesto_se_normaliza(datos):
    assert estados(datos).loc[(1, 2024), "impuesto"] == -150_000  # «Ingreso (gasto)»: el gasto es negativo
    assert estados(datos).loc[(7, 2017), "impuesto"] == -50_000  # 2017 viene con el signo invertido


def test_auditoria_cuenta_las_filas_repetidas(datos):
    aud = pd.read_parquet(datos / "silver" / "auditoria_anio.parquet").set_index("anio")
    assert aud.loc[2024, "filas_repetidas"] == 3  # tres rubros repetidos una vez
    assert aud.loc[2024, "claves_con_valores_distintos"] == 0
    assert aud.loc[2024, "informes_descartados"] == 3


def test_rubro_no_mapeado_no_llega_al_gold(datos):
    cols = set(estados(datos).columns)
    assert "ingresos" in cols and not any("algo" in c for c in cols)


def test_caratula_limpia_estado_opinion_y_ciiu(datos):
    e = pd.read_parquet(datos / "gold" / "empresas_anio.parquet").set_index(["nit", "anio"]).loc[(1, 2024)]
    assert e["estado_actual"] == "ACUERDO DE REESTRUCTURACIÓN"
    assert e["opinion_revisor"] == "con salvedad"
    assert bool(e["reexpresion"]) is True
    assert e["ciiu_codigo"] == "6810" and e["ciiu_division"] == "68" and e["ciiu_origen"] == "propio"


def test_ciiu_se_hereda_del_anio_mas_cercano_y_se_marca(datos):
    ea = pd.read_parquet(datos / "gold" / "empresas_anio.parquet").set_index(["nit", "anio"])
    assert ea.loc[(9, 2019), "ciiu_codigo"] == "4711"
    assert ea.loc[(9, 2019), "ciiu_origen"] == "heredado_2020"
    assert ea.loc[(9, 2020), "ciiu_origen"] == "propio"


def test_municipio_se_resuelve_aunque_la_fuente_pierda_tildes(datos):
    ea = pd.read_parquet(datos / "gold" / "empresas_anio.parquet").set_index(["nit", "anio"])
    assert ea.loc[(1, 2024), "cod_mpio"] == "25126"  # «CAJICA-CUNDINAMARCA»: sufijo del departamento
    assert ea.loc[(2, 2024), "cod_mpio"] == "11001" and ea.loc[(2, 2024), "municipio"] == "BOGOTÁ, D.C."  # sin tilde
    assert ea.loc[(3, 2024), "cod_mpio"] == "05001" and ea.loc[(3, 2024), "municipio"] == "MEDELLÍN"  # «MEDELL�N»
    assert pd.isna(ea.loc[(4, 2024), "cod_mpio"])  # no se adivina


def test_municipio_con_sufijo_abreviado_y_guion_como_espacio():
    df = pd.DataFrame({"ciudad": ["CALI-VALLE", "CARTAGENA-BOLIVAR", "SANTA-MARTA-MAGDALENA", "CALI-VALLE", None],
                       "departamento": ["VALLE", "BOLIVAR", "MAGDALENA", "ANTIOQUIA", None]})
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as t:
        data = Path(t) / "finanzas"
        (data / "ref").mkdir(parents=True)
        pd.DataFrame({"cod_mpio": ["76001", "13001", "47001"], "municipio": ["CALI", "CARTAGENA DE INDIAS", "SANTA MARTA"],
                      "departamento": ["VALLE DEL CAUCA", "BOLÍVAR", "MAGDALENA"]}).to_parquet(data / "ref" / "divipola.parquet")
        r = tr._ubicacion(df, data)
    assert list(r["cod_mpio"][:3]) == ["76001", "13001", "47001"]
    assert pd.isna(r["cod_mpio"][3])  # departamento que no corresponde: no se adivina
    assert pd.isna(r["cod_mpio"][4])


def test_empresas_trae_el_ultimo_anio(datos):
    emp = pd.read_parquet(datos / "gold" / "empresas.parquet").set_index("nit")
    assert emp.loc[9, "ultimo_anio"] == 2020 and emp.loc[9, "anios_reportados"] == 2


def test_ninguna_columna_publicada_es_de_contacto(datos):
    for archivo in ("estados", "empresas_anio", "empresas"):
        columnas = pd.read_parquet(datos / "gold" / f"{archivo}.parquet").columns
        for c in columnas:
            for prohibida in cp.PROHIBIDAS_CONTACTO:
                assert prohibida not in cp.clave(c), (archivo, c)


def test_fecha_de_constitucion_vacia_no_rompe(datos):
    ea = pd.read_parquet(datos / "gold" / "empresas_anio.parquet")
    assert ea["fecha_constitucion"].isna().all() or isinstance(ea["fecha_constitucion"].dropna().iloc[0], date)


def test_parsear_ciiu():
    assert tr.parsear_ciiu("L6810 - Actividades inmobiliarias realizadas con bienes propios") == ("6810", "Actividades inmobiliarias realizadas con bienes propios")
    assert tr.parsear_ciiu("4711") == ("4711", None)
    assert tr.parsear_ciiu("sin dato") == (None, None)
    assert tr.parsear_ciiu(None) == (None, None)


def test_estado_legible_restaura_categorias_conocidas():
    assert tr.estado_legible("ACUERDO DE REESTRUCTURACI�N") == "ACUERDO DE REESTRUCTURACIÓN"
    assert tr.estado_legible("ACTIVA") == "ACTIVA"
