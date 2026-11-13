import pandas as pd

from pipelines.finanzas import calidad as cal
from pipelines.finanzas import conceptos as cp


def estados(filas):
    cols = ["nit", "anio", "tipo_estado", *cp.NUCLEO]
    return pd.DataFrame(filas, columns=cols)


def test_num_limpia_signos_y_moneda():
    s = pd.Series(["$113.92", "-$0.25", "$1,234.50", "nan", None])
    r = cal._num(s)
    assert r.iloc[0] == 113.92 and r.iloc[1] == -0.25 and r.iloc[2] == 1234.5
    assert pd.isna(r.iloc[3]) and pd.isna(r.iloc[4])


def test_nucleo_exige_las_ocho_y_solo_cuenta_individuales():
    completo = (1, 2024, "individual", *[1] * 8)
    sin_ingresos = (2, 2024, "individual", 1, 1, 1, 1, 1, None, 1, 1)
    separado = (3, 2024, "separado", *[None] * 8)  # no cuenta: no es individual
    r = cal.nucleo(estados([completo, sin_ingresos, separado])).iloc[0]
    assert r["individuales"] == 2 and r["todas_las_8"] == 0.5 and r["ingresos"] == 0.5 and r["activo_total"] == 1.0


def test_identidad_tolera_el_redondeo_a_miles_pero_no_un_descuadre():
    base = {"tipo_estado": "individual", "activo_corriente": 0, "pasivo_corriente": 0, "ingresos": 0,
            "ganancia_operacional": 0, "ganancia_neta": 0}
    e = pd.DataFrame([
        dict(nit=1, anio=2024, activo_total=10_000_000, pasivo_total=6_000_000, patrimonio=4_000_000, **base),
        dict(nit=2, anio=2024, activo_total=10_000_000, pasivo_total=6_000_000, patrimonio=3_999_000, **base),  # 1 000 pesos: redondeo
        dict(nit=3, anio=2024, activo_total=10_000_000, pasivo_total=6_000_000, patrimonio=3_000_000, **base),  # descuadre real
    ])
    r = cal.identidad(e).iloc[0]
    assert r["informes"] == 3 and abs(r["cumple"] - 2 / 3) < 1e-9


def test_pct_con_vacios():
    assert cal.pct(float("nan")) == "–" and cal.pct(0.987) == "98.7 %"
