from pipelines.finanzas import conceptos as cp
from pipelines.finanzas.ingesta import clasificar_punto, where_conjunto


def test_clave_quita_caracter_danado_y_acentos_de_los_dos_lados():
    roto = "Ganancia (p�rdida) por actividades de operaci�n"
    bueno = "Ganancia (pérdida) por actividades de operación"
    assert cp.clave(roto) == cp.clave(bueno) == "ganancia (prdida) por actividades de operacin"


def test_clave_ignora_mayusculas_y_espacios():
    assert cp.clave("  TOTAL   de Activos ") == "total de activos"


def test_mapear_alias_de_la_taxonomia_2017():
    assert cp.mapear("esf", "Activos")[0] == "activo_total"
    assert cp.mapear("esf", "Total de activos")[0] == "activo_total"
    assert cp.mapear("esf", "Patrimonio")[0] == "patrimonio"
    assert cp.mapear("esf", "Cuentas por pagar comerciales y otras cuentas por pagar")[0] == "cxp_comerciales"
    assert cp.mapear("esf", "Cuentas por pagar comerciales y otras cuentas por pagar corrientes")[0] == "cxp_comerciales"


def test_signo_del_impuesto_2017_esta_invertido():
    variable, signo, _ = cp.mapear("eri", "Gasto (ingreso) por impuestos, operaciones continuadas")
    assert (variable, signo) == ("impuesto", -1)
    variable, signo, _ = cp.mapear("eri", "Ingreso (gasto) por impuestos")
    assert (variable, signo) == ("impuesto", 1)


def test_gastos_de_venta_acepta_los_dos_nombres():
    assert cp.mapear("eri", "Gastos de ventas")[0] == "gastos_venta"
    assert cp.mapear("eri", "Costos de distribuci�n")[0] == "gastos_venta"


def test_mismo_rotulo_en_otro_estado_no_se_mezcla():
    # «Ganancia (pérdida)» del resultado no es el «(+/-) Ganancia (pérdida)» del flujo de efectivo
    assert cp.mapear("eri", "Ganancia (p�rdida)")[0] == "ganancia_neta"
    assert cp.mapear("efe", "(+/-) Ganancia (p�rdida)") is None
    assert cp.mapear("esf", "Ganancia (p�rdida)") is None


def test_rubro_desconocido_no_se_mapea():
    assert cp.mapear("esf", "Plusvalía") is None


def test_patron_soql_usa_comodin_donde_hay_acentos():
    assert cp.patron_soql("Ganancia (pérdida)") == "Ganancia (p_rdida)"
    assert cp.patron_soql("Gastos de administración") == "Gastos de administraci_n"
    assert cp.patron_soql("Total de activos") == "Total de activos"


def test_patrones_soql_cubren_todos_los_rubros():
    for estado in ("esf", "eri", "efe"):
        assert len(cp.patrones_soql(estado)) >= len(cp.rubros_de(estado))


def test_el_filtro_de_la_caratula_es_una_lista_blanca_sin_contacto():
    claves = [cp.clave(v) for v in cp.CAMPOS_CARATULA.values()]
    for prohibida in cp.PROHIBIDAS_CONTACTO:
        assert not any(prohibida in k for k in claves), prohibida
    consulta = where_conjunto("caratula", 2024, [412, 421]).lower()
    for prohibida in ("telefono", "celular", "mail", "correo", "notificaci"):
        assert prohibida not in consulta


def test_where_de_estados_excluye_el_periodo_anterior():
    w = where_conjunto("esf", 2016, [224, 227])
    assert "fecha_corte='2016-12-31'" in w
    assert "NOT (periodo='Periodo Anterior' OR periodo='2015' OR periodo like '2015-%')" in w
    assert "id_punto_entrada in (224,227)" in w


def test_clasificar_punto_de_entrada():
    assert clasificar_punto("40 NIIF Pymes - Individual Grupo 2") == ("individual", "G2")
    assert clasificar_punto("10 NIIF Plenas - Individuales") == ("individual", "G1")
    assert clasificar_punto("20 NIIF Plenas - Separado Grupo 1") == ("separado", "G1")
    assert clasificar_punto("50 NIIF Pymes - Separados") == ("separado", "G2")
    assert clasificar_punto("30 NIIF Plenas - Consolidado Grupo 1") is None
    assert clasificar_punto("65 NIIF Pymes - Combinado Grupo 2") is None
