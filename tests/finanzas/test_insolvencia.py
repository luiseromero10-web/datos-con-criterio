from pathlib import Path

import openpyxl
import pandas as pd
import pytest

from pipelines.finanzas import insolvencia as ins


def test_familia_de_proceso_en_todos_los_formatos():
    assert ins.familia("REORGANIZACIÓN EN EJECUCIÓN") == "reorganizacion"
    assert ins.familia("Reorganización en Trámite") == "reorganizacion"
    assert ins.familia("REORGANIZACIÓN ABREVIADA") == "reorganizacion"
    for liquidacion in ("LIQUIDACIÓN JUDICIAL", "LIQUIDACIÓN SIMPLIFICADA", "LIQUIDACIÓN POR ADJUDICACIÓN", "LIQUIDACI�N JUDICIAL EN TRAMITE"):
        assert ins.familia(liquidacion) == "liquidacion", liquidacion
    for otro in ("NEGOCIACIÓN DE EMERGENCIA", "VALIDACIÓN", "COMERCIO", "G5221", None, float("nan")):
        assert ins.familia(otro) == "otro", otro
    assert ins.en_ejecucion("REORGANIZACIÓN EJECUCION") and ins.en_ejecucion("REORGANIZACI�N EN EJECUCI�N")
    assert not ins.en_ejecucion("REORGANIZACIÓN EN TRÁMITE")


def test_anio_y_fecha_cubre_los_formatos_raros_de_la_columna_de_apertura():
    assert ins.anio_y_fecha(2023)[0] == 2023
    assert ins.anio_y_fecha("2021")[0] == 2021
    anio, fecha = ins.anio_y_fecha(pd.Timestamp("2018-07-18"))  # fecha completa (corte de marzo 2020)
    assert anio == 2018 and fecha == pd.Timestamp("2018-07-18")
    # Excel guarda el número 2025 como el serial 2025 = 1905-07-17 (y 2024 como 1905-07-16); comprobado contra cortes vecinos (98,7 % de coincidencia)
    assert ins.anio_y_fecha(pd.Timestamp("1905-07-17"))[0] == 2025 and ins.anio_y_fecha(pd.Timestamp("1905-07-16"))[0] == 2024
    for basura in (5, 99999, "COMERCIO", None, float("nan"), pd.Timestamp("1905-01-01")):
        assert pd.isna(ins.anio_y_fecha(basura)[0]), basura


def fila(nit, proceso, apertura, fecha=None, corte="2020-06"):
    return {"nit": nit, "familia": ins.familia(proceso), "ejecucion": ins.en_ejecucion(proceso), "anio_ref": float(apertura),
            "fecha_admision": pd.Timestamp(fecha) if fecha else pd.NaT, "corte": corte}


def test_reglas_del_anio_de_admision():
    e = ins.anio_estimado(pd.DataFrame([fila(1, "Reorganización en Trámite", 2021)]))
    assert (e["anio_admision"], e["precision"]) == (2021, "anio_apertura")
    e = ins.anio_estimado(pd.DataFrame([fila(2, "REORGANIZACIÓN EN EJECUCIÓN", 2021)]))
    assert (e["anio_admision"], e["precision"]) == (2020, "acuerdo_menos_1")  # el año de la columna es el del acuerdo
    e = ins.anio_estimado(pd.DataFrame([fila(3, "REORGANIZACIÓN EN EJECUCIÓN", 2021, fecha="2018-05-04")]))
    assert (e["anio_admision"], e["precision"]) == (2018, "exacta")  # la fecha exacta manda
    e = ins.anio_estimado(pd.DataFrame([fila(4, "LIQUIDACIÓN JUDICIAL", 2019)]))
    assert (e["anio_admision"], e["precision"]) == (2019, "anio_apertura")


def escribir_corte(ruta: Path, filas: list[tuple], formato="nuevo"):
    wb = openpyxl.Workbook()
    ws = wb.active
    if formato == "nuevo":
        ws.append(["Nro", "NIT", "NOMBRE", "PROCESO", "CATEGORIA", "AÑO_DE_APERTURA_CELEBRACION", "FECHA AUTO ADMISION"])
    else:
        ws.append(["Nro", "NIT", "NOMBRE", "PROCESO", "CATEGORÍA SS", "AÑO_DE_APERTURA/CELEBRACIÓN"])
    for i, (nit, proceso, apertura, *resto) in enumerate(filas, 1):
        ws.append([i, nit, f"EMPRESA {nit}", proceso, "A", apertura, *([resto[0]] if formato == "nuevo" else [])])
    wb.save(ruta)


@pytest.fixture
def cortes(tmp_path, monkeypatch):
    """Tres cortes: un proceso que ya terminó (solo en el primero), uno que sigue y uno que llega después."""
    crudo = tmp_path / "raw"
    crudo.mkdir()
    escribir_corte(crudo / "a.xlsx", [(10, "REORGANIZACIÓN EN TRÁMITE", 2019, None), (11, "LIQUIDACIÓN JUDICIAL", 2019, None), (12, "NEGOCIACIÓN DE EMERGENCIA", 2019, None)], "viejo")
    escribir_corte(crudo / "b.xlsx", [(10, "REORGANIZACIÓN EN EJECUCIÓN", 2020, None), (13, "REORGANIZACIÓN EN TRÁMITE", 2020, None)], "viejo")
    escribir_corte(crudo / "c.xlsx", [(10, "REORGANIZACIÓN EJECUCION", 2020, "2019-03-15"), (14, "LIQUIDACIÓN JUDICIAL EN TRAMITE", 2021, "2021-02-01")])
    lista = tmp_path / "lista.json"
    import json
    lista.write_text(json.dumps({"cortes": [{"archivo": "a.xlsx", "corte": "2019-12"}, {"archivo": "b.xlsx", "corte": "2020-06"},
                                            {"archivo": "c.xlsx", "corte": "2021-06"}]}), encoding="utf-8")
    monkeypatch.setattr(ins, "LISTA", lista)
    return crudo


def test_la_union_de_cortes_recupera_procesos_que_ya_no_figuran(cortes):
    ev = ins.construir(cortes).set_index(["nit", "familia"])
    assert (11, "liquidacion") in ev.index  # solo estaba en el primer corte: ya terminó, pero cuenta
    assert (12, "otro") not in ev.index and 12 not in ev.reset_index()["nit"].tolist()  # negociación de emergencia: no es el evento
    assert ev.loc[(11, "liquidacion"), "anio_admision"] == 2019 and ev.loc[(11, "liquidacion"), "ultimo_corte"] == "2019-12"
    assert ev.loc[(10, "reorganizacion"), "anio_admision"] == 2019  # la fecha exacta del último corte manda sobre los años de los anteriores
    assert ev.loc[(10, "reorganizacion"), "precision"] == "exacta" and ev.loc[(10, "reorganizacion"), "primer_corte"] == "2019-12"
    assert ev.loc[(13, "reorganizacion"), "anio_admision"] == 2020
    assert ev.loc[(14, "liquidacion"), "precision"] == "exacta"


def test_lector_de_cortes_unifica_formatos(cortes):
    viejo = ins.leer_corte(cortes / "a.xlsx", "2019-12")
    nuevo = ins.leer_corte(cortes / "c.xlsx", "2021-06")
    assert list(viejo.columns) == list(nuevo.columns)
    assert viejo["fecha_admision"].isna().all() and nuevo["fecha_admision"].notna().all()
    assert nuevo.loc[nuevo["nit"] == 14, "familia"].iloc[0] == "liquidacion"
