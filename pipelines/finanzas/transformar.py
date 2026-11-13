"""bronze -> silver -> gold con DuckDB.

silver
  informes.parquet          todos los informes y por qué se elige o descarta cada uno
  estados_largos.parquet    (nit, anio, variable, valor_pesos) del informe elegido
  caratula.parquet          identidad del informe elegido (sin datos de contacto)
  auditoria_anio.parquet    filas, duplicados y descartes por año
gold
  estados.parquet           una fila por sociedad y año, una columna por variable estándar (en pesos)
  empresas_anio.parquet     identidad por sociedad y año (CIIU heredado donde falta)
  empresas.parquet          una fila por sociedad (último año reportado)

Reglas (docs/finanzas/fuentes.md): se deduplica por (informe, rubro, periodo) antes de todo; por sociedad y año se elige
el informe que trae balance, individual sobre separado, y el de radicado más reciente; `valor` está en miles de pesos.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import duckdb
import pandas as pd

from pipelines.finanzas import conceptos as cp
from pipelines.finanzas.config import DATA, ESTADOS, UNIDAD_FUENTE

OPINIONES = {"01": "abstención", "02": "con salvedad", "03": "limpio", "04": "negativo"}
# El «�» de la fuente se pierde; para las categorías cerradas se restaura el texto correcto.
ESTADOS_LEGIBLES = {
    "activa": "ACTIVA",
    "acuerdo de reorganizacion": "ACUERDO DE REORGANIZACIÓN",
    "acuerdo de reestructuracin": "ACUERDO DE REESTRUCTURACIÓN",
    "en etapa preoperativa": "EN ETAPA PREOPERATIVA",
    "concordato en ejecucin": "CONCORDATO EN EJECUCIÓN",
    "concordato en trmite": "CONCORDATO EN TRÁMITE",
}


def estado_legible(texto: str | None) -> str | None:
    if not isinstance(texto, str):
        return None
    return ESTADOS_LEGIBLES.get(cp.clave(texto), texto.replace("�", "?"))


def parsear_ciiu(texto: str | None) -> tuple[str | None, str | None]:
    """«L6810 - Actividades inmobiliarias…» -> («6810», «Actividades inmobiliarias…»)."""
    if not isinstance(texto, str) or not texto:
        return None, None
    m = re.match(r"^\s*[A-Za-z]?\s*(\d{4})\b\s*[-–:]?\s*(.*)$", texto)
    if not m:
        return None, None
    return m.group(1), (m.group(2).replace("�", "?").strip() or None)


def _parquets(data: Path, conjunto: str) -> str:
    return (data / "bronze" / conjunto / "anio=*.parquet").as_posix()


def _estados_bronze(con: duckdb.DuckDBPyConnection, data: Path) -> None:
    """Vista `crudo`: filas de los tres estados financieros con tipos limpios."""
    partes = []
    for e in ESTADOS:
        partes.append(f"""
            SELECT '{e}' AS estado,
                   CAST(regexp_extract(filename, 'anio=(\\d{{4}})', 1) AS INTEGER) AS anio,
                   TRY_CAST(codigo_instancia AS BIGINT) AS codigo_instancia,
                   TRY_CAST(TRY_CAST(nit AS DOUBLE) AS BIGINT) AS nit,
                   numero_radicado,
                   TRY_CAST(id_punto_entrada AS BIGINT) AS id_punto_entrada,
                   concepto, periodo,
                   TRY_CAST(valor AS DOUBLE) AS valor_miles
            FROM read_parquet('{_parquets(data, e)}', filename=true, union_by_name=true)""")
    con.execute("CREATE OR REPLACE VIEW crudo AS " + " UNION ALL ".join(partes))


def _tabla_mapeo(con: duckdb.DuckDBPyConnection) -> None:
    distintos = con.execute("SELECT DISTINCT estado, concepto FROM crudo").df()
    filas = []
    for estado, concepto in zip(distintos["estado"], distintos["concepto"], strict=True):
        m = cp.mapear(estado, concepto)
        if m:
            filas.append((estado, concepto, *m))
    mapa = pd.DataFrame(filas, columns=["estado", "concepto", "variable", "signo", "prioridad"])
    con.register("mapa_df", mapa)
    con.execute("CREATE OR REPLACE TABLE mapa AS SELECT * FROM mapa_df")


def construir_silver(data: Path = DATA) -> None:
    silver = data / "silver"
    silver.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    _estados_bronze(con, data)
    _tabla_mapeo(con)
    puntos = (data / "bronze" / "puntos_entrada" / "anio=*.parquet").as_posix()
    con.execute(f"""CREATE VIEW puntos AS SELECT anio, CAST(id_punto_entrada AS BIGINT) AS id_punto_entrada, tipo, grupo
                    FROM read_parquet('{puntos}')""")

    # 1) rubros mapeados del periodo actual. Formas según el año: «Periodo Actual», «2016» y «2016-dic-31».
    #    El flujo de efectivo de 2016 trae el NIT en `periodo` (defecto de la fuente) y mezcla el actual con el anterior
    #    en el 29 % de los informes: se excluye entero (flujo_* y depreciación quedan vacíos en 2016).
    con.execute("""
        CREATE TABLE mapeado AS
        SELECT c.estado, c.anio, c.codigo_instancia, c.nit, c.numero_radicado, c.id_punto_entrada, c.concepto, c.periodo,
               c.valor_miles, m.variable, m.signo, m.prioridad
        FROM crudo c JOIN mapa m ON m.estado = c.estado AND m.concepto = c.concepto
        WHERE c.periodo IN ('Periodo Actual', CAST(c.anio AS VARCHAR), CAST(c.anio AS VARCHAR) || '-dic-31',
                            CAST(c.anio AS VARCHAR) || '-Dec-31', CAST(c.anio AS VARCHAR) || '-12-31')""")

    # 2) deduplicar por (informe, estado, rubro, periodo): auditar cuántas filas sobran y si los valores difieren
    con.execute("""
        CREATE TABLE dup_audit AS
        SELECT anio,
               COUNT(*) AS filas_mapeadas,
               COUNT(DISTINCT (codigo_instancia, estado, concepto, periodo)) AS filas_unicas
        FROM mapeado GROUP BY anio""")
    con.execute("""
        CREATE TABLE conflictos AS
        SELECT anio, COUNT(*) AS claves_con_valores_distintos FROM (
            SELECT anio, codigo_instancia, estado, concepto, periodo
            FROM mapeado GROUP BY ALL HAVING COUNT(DISTINCT valor_miles) > 1)
        GROUP BY anio""")
    con.execute("""
        CREATE TABLE dedup AS
        SELECT * FROM mapeado
        QUALIFY row_number() OVER (PARTITION BY codigo_instancia, estado, concepto, periodo
                                   ORDER BY valor_miles DESC NULLS LAST) = 1""")

    # 3) una sola fila por (informe, variable): si dos alias coinciden, gana el de menor prioridad
    con.execute("""
        CREATE TABLE por_variable AS
        SELECT * FROM dedup
        QUALIFY row_number() OVER (PARTITION BY codigo_instancia, variable ORDER BY prioridad, periodo) = 1""")

    # 4) informes: todos los que aparecen en los estados o en la carátula
    car = _parquets(data, "caratula")
    con.execute(f"""
        CREATE TABLE informes_base AS
        SELECT DISTINCT anio, codigo_instancia, nit, numero_radicado, id_punto_entrada FROM (
            SELECT anio, codigo_instancia, nit, numero_radicado, id_punto_entrada FROM crudo
            UNION ALL
            SELECT CAST(regexp_extract(filename, 'anio=(\\d{{4}})', 1) AS INTEGER),
                   TRY_CAST(codigo_instancia AS BIGINT), TRY_CAST(TRY_CAST(nit AS DOUBLE) AS BIGINT),
                   numero_radicado, TRY_CAST(id_punto_entrada AS BIGINT)
            FROM read_parquet('{car}', filename=true, union_by_name=true))
        WHERE nit IS NOT NULL""")
    con.execute("""
        CREATE TABLE con_balance AS
        SELECT DISTINCT codigo_instancia FROM por_variable WHERE variable = 'activo_total' AND valor_miles IS NOT NULL""")
    con.execute("""
        CREATE TABLE informes AS
        WITH i AS (
            SELECT b.*, p.tipo, p.grupo, (a.codigo_instancia IS NOT NULL) AS tiene_balance
            FROM informes_base b
            JOIN puntos p ON p.anio = b.anio AND p.id_punto_entrada = b.id_punto_entrada
            LEFT JOIN con_balance a ON a.codigo_instancia = b.codigo_instancia),
        r AS (
            SELECT *, row_number() OVER (PARTITION BY anio, nit
                ORDER BY tiene_balance DESC, (tipo = 'individual') DESC, numero_radicado DESC, codigo_instancia DESC) AS puesto
            FROM i)
        SELECT anio, nit, codigo_instancia, numero_radicado, id_punto_entrada, tipo AS tipo_estado, grupo, tiene_balance,
               puesto = 1 AS seleccionado,
               CASE WHEN puesto = 1 THEN NULL
                    WHEN NOT tiene_balance THEN 'sin balance'
                    ELSE 'otro informe de la misma sociedad y año' END AS motivo_descarte
        FROM r""")
    con.execute(f"COPY informes TO '{(silver / 'informes.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")

    # 5) estados en formato largo, en pesos, del informe elegido
    con.execute(f"""
        COPY (
            SELECT i.nit, i.anio, i.codigo_instancia, i.grupo, i.tipo_estado, v.variable,
                   CAST(round(v.valor_miles * v.signo * {UNIDAD_FUENTE}) AS BIGINT) AS valor_pesos
            FROM por_variable v JOIN informes i ON i.codigo_instancia = v.codigo_instancia AND i.seleccionado
            WHERE v.valor_miles IS NOT NULL
            ORDER BY i.anio, i.nit, v.variable
        ) TO '{(silver / 'estados_largos.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")

    # 6) auditoría por año
    con.execute("""
        CREATE TABLE auditoria AS
        SELECT i.anio,
               COUNT(*) AS informes_individual_separado,
               COUNT(DISTINCT i.nit) AS nit_distintos,
               SUM(CASE WHEN i.seleccionado THEN 1 ELSE 0 END) AS informes_elegidos,
               SUM(CASE WHEN NOT i.seleccionado THEN 1 ELSE 0 END) AS informes_descartados,
               SUM(CASE WHEN i.seleccionado AND i.tipo_estado = 'individual' THEN 1 ELSE 0 END) AS elegidos_individual,
               SUM(CASE WHEN i.seleccionado AND i.tipo_estado = 'separado' THEN 1 ELSE 0 END) AS elegidos_separado
        FROM informes i GROUP BY i.anio""")
    con.execute(f"""
        COPY (SELECT a.*, d.filas_mapeadas, d.filas_unicas, d.filas_mapeadas - d.filas_unicas AS filas_repetidas,
                     COALESCE(c.claves_con_valores_distintos, 0) AS claves_con_valores_distintos
              FROM auditoria a JOIN dup_audit d USING (anio) LEFT JOIN conflictos c USING (anio) ORDER BY anio)
        TO '{(silver / 'auditoria_anio.parquet').as_posix()}' (FORMAT PARQUET)""")

    _caratula(con, data)
    con.close()


def _caratula(con: duckdb.DuckDBPyConnection, data: Path) -> None:
    """Identidad del informe elegido: solo los campos de la lista blanca."""
    silver = data / "silver"
    car = _parquets(data, "caratula")
    clave_a_campo = {cp.clave(v): k for k, v in cp.CAMPOS_CARATULA.items()}
    con.execute(f"""
        CREATE TABLE car_crudo AS
        SELECT TRY_CAST(codigo_instancia AS BIGINT) AS codigo_instancia, concepto, valor
        FROM read_parquet('{car}', union_by_name=true) WHERE valor IS NOT NULL AND valor <> 'nan'""")
    conceptos = con.execute("SELECT DISTINCT concepto FROM car_crudo").df()["concepto"]
    filas = [(c, clave_a_campo[cp.clave(c)]) for c in conceptos if cp.clave(c) in clave_a_campo]
    con.register("mapa_car_df", pd.DataFrame(filas, columns=["concepto", "campo"]))
    columnas = ", ".join(f"max(CASE WHEN m.campo = '{c}' THEN k.valor END) AS {c}" for c in cp.CAMPOS_CARATULA)
    con.execute(f"""
        CREATE TABLE car_ancha AS
        SELECT i.nit, i.anio, i.codigo_instancia, i.grupo, i.tipo_estado, {columnas}
        FROM informes i
        JOIN car_crudo k ON k.codigo_instancia = i.codigo_instancia
        JOIN mapa_car_df m ON m.concepto = k.concepto
        WHERE i.seleccionado GROUP BY ALL""")
    df = con.execute("SELECT * FROM car_ancha").df()
    # Reglas de limpieza (en Python: pocas filas y lógica de texto)
    ciiu = df["ciiu_texto"].map(parsear_ciiu)
    df["ciiu_codigo"] = [c[0] for c in ciiu]
    df["ciiu_descripcion"] = [c[1] for c in ciiu]
    df["estado_actual"] = df["estado_actual"].map(estado_legible)
    cod = df["opinion_revisor"].str.extract(r"^\s*(\d+)")[0]
    df["opinion_revisor"] = cod.map(OPINIONES)
    df["tipo_societario"] = df["tipo_societario"].str.replace(r"^\s*\d+\.\s*", "", regex=True).str.replace("�", "?")
    df["regimen_especial"] = df["regimen_especial"].str.replace(r"^\s*\d+\.\s*", "", regex=True).str.replace("�", "?")
    for c in ("reexpresion", "obligada_revisor"):
        df[c] = df[c].str.lower().map({"true": True, "false": False})
    df["fecha_constitucion"] = pd.to_datetime(df["fecha_constitucion"], errors="coerce").dt.date
    df["razon_social"] = df["razon_social"].str.replace("�", "?").str.strip()
    df = df.drop(columns=["ciiu_texto", "ciudad", "departamento"]).join(_ubicacion(df, data))
    df.to_parquet(silver / "caratula.parquet", index=False)


def _letras(texto: str) -> str:
    """Solo las letras a-z, sin acentos ni mayúsculas: «BOGOTÁ, D.C.» -> «bogotadc»."""
    t = unicodedata.normalize("NFKD", texto.lower())
    return re.sub(r"[^a-z]", "", "".join(c for c in t if not unicodedata.combining(c)))


def _patron_nombre(crudo: object) -> re.Pattern[str] | None:
    """Patrón para un nombre de la carátula: cada «�» (letra perdida) vale por una letra cualquiera."""
    if not isinstance(crudo, str) or not crudo.strip():
        return None
    t = unicodedata.normalize("NFKD", crudo.lower())
    partes = []
    for c in t:
        if c == "�":
            partes.append("[a-z]")
        elif "a" <= c <= "z":
            partes.append(c)
    return re.compile("".join(partes)) if partes else None


def _ubicacion(df: pd.DataFrame, data: Path) -> pd.DataFrame:
    """Ciudad y departamento del domicilio con nombre correcto y código DIVIPOLA.

    La fuente a veces quita la tilde («BOGOTA D.C.»), a veces la daña («MEDELL�N»), pega el departamento a la ciudad
    («CALI-VALLE»), usa el guion también como espacio («SANTA-MARTA-MAGDALENA») y abrevia («CARTAGENA», «VALLE»).
    Se compara dentro del departamento, primero por nombre completo y luego por prefijo, y solo se asigna cuando la
    coincidencia es única; si no, queda vacío (nunca se adivina).
    """
    columnas = ["cod_mpio", "municipio", "departamento"]
    ref = data.parent / "ref" / "divipola.parquet"
    if not ref.exists():
        return pd.DataFrame({c: [None] * len(df) for c in columnas}, index=df.index)
    div = pd.read_parquet(ref)
    div["k"] = div["municipio"].map(_letras)
    div["kd"] = div["departamento"].map(_letras)
    crudas = df["ciudad"].fillna("")
    deptos = df["departamento"].fillna("")
    resuelto: dict[tuple[str, str], tuple[object, object, object]] = {}
    for ciudad, depto in set(zip(crudas, deptos, strict=True)):
        sufijo = f"-{depto}"
        sin_sufijo = ciudad[: -len(sufijo)] if depto and ciudad.endswith(sufijo) else ciudad
        pd_ = _patron_nombre(depto)
        en_depto = div[div["kd"].map(lambda k, pd_=pd_: pd_ is not None and pd_.match(k) is not None)] if pd_ is not None else div.iloc[0:0]
        res: tuple[object, object, object] = (None, None, None)
        for candidata in dict.fromkeys([sin_sufijo, ciudad.split("-")[0]]):
            pc = _patron_nombre(candidata)
            if pc is None:
                continue
            exacto = en_depto[en_depto["k"].map(lambda k, pc=pc: pc.fullmatch(k) is not None)]
            prefijo = en_depto[en_depto["k"].map(lambda k, pc=pc: pc.match(k) is not None)]
            fila = exacto.iloc[0] if len(exacto) == 1 else (prefijo.iloc[0] if len(exacto) == 0 and len(prefijo) == 1 else None)
            if fila is None and pd_ is None:  # departamento ilegible: solo si el nombre es único en todo el país
                todos = div[div["k"].map(lambda k, pc=pc: pc.fullmatch(k) is not None)]
                fila = todos.iloc[0] if len(todos) == 1 else None
            if fila is not None:
                res = (fila["cod_mpio"], fila["municipio"], fila["departamento"])
                break
        resuelto[(ciudad, depto)] = res
    salida = [resuelto[(c, d)] for c, d in zip(crudas, deptos, strict=True)]
    return pd.DataFrame(salida, columns=columnas, index=df.index)


def construir_gold(data: Path = DATA) -> None:
    silver, gold = data / "silver", data / "gold"
    gold.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    variables = list(dict.fromkeys(r.variable for r in cp.RUBROS))
    cols = ",\n  ".join(f"max(CASE WHEN variable = '{v}' THEN valor_pesos END) AS {v}" for v in variables)
    con.execute(f"""
        COPY (
            WITH e AS (
                SELECT nit, anio, any_value(codigo_instancia) AS codigo_instancia, any_value(grupo) AS grupo,
                       any_value(tipo_estado) AS tipo_estado, {cols}
                FROM read_parquet('{(silver / 'estados_largos.parquet').as_posix()}') GROUP BY nit, anio)
            SELECT e.*, i.numero_radicado
            FROM e JOIN read_parquet('{(silver / 'informes.parquet').as_posix()}') i
              ON i.codigo_instancia = e.codigo_instancia
            ORDER BY anio, nit
        ) TO '{(gold / 'estados.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")

    # CIIU: la carátula solo lo trae desde 2020; antes se hereda del año más cercano que lo tenga (empate: el siguiente)
    con.execute(f"CREATE TABLE car AS SELECT * FROM read_parquet('{(silver / 'caratula.parquet').as_posix()}')")
    con.execute("""
        CREATE TABLE heredado AS
        SELECT a.nit, a.anio, b.anio AS anio_ciiu, b.ciiu_codigo, b.ciiu_descripcion
        FROM car a JOIN car b ON b.nit = a.nit AND b.ciiu_codigo IS NOT NULL
        WHERE a.ciiu_codigo IS NULL
        QUALIFY row_number() OVER (PARTITION BY a.nit, a.anio ORDER BY abs(a.anio - b.anio), b.anio > a.anio DESC) = 1""")
    con.execute(f"""
        COPY (
            SELECT c.nit, c.anio, c.razon_social, c.grupo, c.tipo_estado,
                   COALESCE(c.ciiu_codigo, h.ciiu_codigo) AS ciiu_codigo,
                   substr(COALESCE(c.ciiu_codigo, h.ciiu_codigo), 1, 2) AS ciiu_division,
                   COALESCE(c.ciiu_descripcion, h.ciiu_descripcion) AS ciiu_descripcion,
                   CASE WHEN c.ciiu_codigo IS NOT NULL THEN 'propio'
                        WHEN h.ciiu_codigo IS NOT NULL THEN 'heredado_' || h.anio_ciiu ELSE NULL END AS ciiu_origen,
                   c.tipo_societario, c.regimen_especial, c.fecha_constitucion, c.estado_actual, c.opinion_revisor,
                   c.obligada_revisor, c.reexpresion, c.cod_mpio, c.municipio, c.departamento
            FROM car c LEFT JOIN heredado h ON h.nit = c.nit AND h.anio = c.anio
            ORDER BY c.anio, c.nit
        ) TO '{(gold / 'empresas_anio.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (
            SELECT * EXCLUDE (n) FROM (
                SELECT *, count(*) OVER (PARTITION BY nit) AS anios_reportados,
                       min(anio) OVER (PARTITION BY nit) AS primer_anio, max(anio) OVER (PARTITION BY nit) AS ultimo_anio,
                       row_number() OVER (PARTITION BY nit ORDER BY anio DESC) AS n
                FROM read_parquet('{(gold / 'empresas_anio.parquet').as_posix()}')) WHERE n = 1
            ORDER BY nit
        ) TO '{(gold / 'empresas.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.close()


def main() -> None:
    construir_silver()
    construir_gold()
    print("silver y gold generados en", DATA)


if __name__ == "__main__":
    main()
