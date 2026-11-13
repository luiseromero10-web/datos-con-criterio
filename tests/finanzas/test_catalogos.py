import openpyxl
import pandas as pd
import pytest

from pipelines.finanzas import catalogos


def xlsx_ipc(ruta, anios=(2023, 2024), mes_faltante=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Total, Índice de Precios al Consumidor (IPC)"])
    ws.append([])
    ws.append(["Mes", *anios, 2026])
    for i, mes in enumerate(catalogos.MESES, 1):
        valores = [None if (mes == mes_faltante and a == anios[-1]) else 100 * (k + 1) + i for k, a in enumerate(anios)]
        ws.append([mes, *valores, 300 + i if i <= 10 else None])  # 2026 llega solo hasta octubre
    ws.append(["Fuente: DANE."])
    wb.save(ruta)


def test_ipc_toma_diciembre_y_el_promedio_y_descarta_anios_incompletos(tmp_path):
    xlsx_ipc(tmp_path / "ipc.xlsx")
    t = catalogos.leer_ipc(tmp_path / "ipc.xlsx").set_index("anio")
    assert list(t.index) == [2023, 2024]  # 2026 solo tiene 10 meses: no entra
    assert t.loc[2023, "ipc_dic"] == 112 and t.loc[2023, "ipc_prom"] == pytest.approx(100 + sum(range(1, 13)) / 12)
    assert t.loc[2024, "ipc_dic"] == 212


def test_ipc_un_mes_faltante_descarta_el_anio(tmp_path):
    xlsx_ipc(tmp_path / "ipc.xlsx", mes_faltante="Marzo")
    assert list(catalogos.leer_ipc(tmp_path / "ipc.xlsx")["anio"]) == [2023]


def test_ciiu_lee_codigos_numericos_y_grupos_con_una_sola_clase(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([])
    ws.append(["División", "Grupo", "Clase", "Descripción"])
    ws.append(["SECCIÓN A", None, None, "AGRICULTURA"])
    ws.append(["01", None, None, "Agricultura"])
    ws.append([None, "011", None, "Cultivos transitorios"])
    ws.append([None, None, "0111", "Cultivo de cereales"])
    ws.append(["SECCIÓN L", None, None, "INMOBILIARIAS"])
    ws.append([68, None, None, "Actividades inmobiliarias"])  # número en vez de texto
    ws.append([None, 681, 6810, "Inmobiliarias con bienes propios"])  # grupo y clase en la misma fila, como números
    wb.save(tmp_path / "ciiu.xlsx")
    c = catalogos.leer_ciiu(tmp_path / "ciiu.xlsx")
    assert c["nivel"].value_counts().to_dict() == {"seccion": 2, "division": 2, "grupo": 2, "clase": 2}
    fila = c[c["codigo"] == "6810"].iloc[0]
    assert fila["nivel"] == "clase" and fila["division"] == "68" and fila["seccion"] == "L"
    assert c[c["codigo"] == "0111"].iloc[0]["seccion"] == "A" and "681" in set(c["codigo"])


def test_los_catalogos_versionados_cubren_los_anios_y_las_divisiones_que_se_usan():
    ipc = catalogos.ipc()
    assert set(range(2016, 2026)) <= set(ipc["anio"]) and (ipc["ipc_prom"] > 0).all()
    assert ipc.set_index("anio").loc[2018, "ipc_dic"] == pytest.approx(100.0)  # base: diciembre de 2018 = 100
    c = catalogos.ciiu()
    assert (c["nivel"] == "division").sum() == 88 and (c["nivel"] == "seccion").sum() == 21
    assert isinstance(c, pd.DataFrame) and c["nombre"].notna().all()
