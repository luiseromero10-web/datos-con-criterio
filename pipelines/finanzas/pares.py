"""Pares, percentiles y vista de sector (plan, sección 4.4).

Grupo de pares de una sociedad en un año (decisión confirmada en la Fase 0):
  1. CIIU de 4 dígitos con al menos 45 sociedades ese año: se parte en terciles de ingresos y los pares son su mismo tercil.
  2. Si no, su división CIIU (2 dígitos) con al menos 45: terciles de ingresos de toda la división.
  3. Si no, su división completa si tiene al menos 15 (sin terciles).
  4. Si no, no hay pares y no se calculan percentiles.
La sociedad sin ingresos positivos cae en el tercil más bajo. El empate se rompe por activo total y luego NIT, para que sea estable.

Percentil (0–100, entero): sobre los pares que tienen el indicador y contando a la sociedad.
  - Indicadores donde más es mejor: porcentaje de pares con un valor estrictamente menor.
  - Donde menos es mejor (endeudamiento, apalancamiento, días de cartera y de inventario, ciclo de caja): se invierte, es decir,
    porcentaje de pares con un valor estrictamente mayor. Así 100 siempre significa «mejor que casi todos sus pares».
  - De sentido neutro (días de proveedores): posición simple, porcentaje estrictamente menor.
Es la convención del observatorio («porcentaje estrictamente menor»). Se calcula por rangos, así que un valor extremo no lo
distorsiona. Con menos de 15 pares con el indicador no se calcula.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipelines.finanzas import catalogos
from pipelines.finanzas.indicadores import IDS, INDICADORES

MIN_TERCIL = 15
MIN_GRUPO = 3 * MIN_TERCIL  # 45: el mínimo para partir en terciles
MIN_PARES = 15  # con menos de 15 valores en el grupo no se calcula el percentil
SENTIDO = {i.id: i.sentido for i in INDICADORES}
CUANTILES = (0.05, 0.25, 0.5, 0.75, 0.95)


def tercil(df: pd.DataFrame, claves: list[str]) -> pd.Series:
    """Tercil (1 = menores ingresos, 3 = mayores) dentro de cada grupo; el empate se rompe por activo total y NIT."""
    ordenado = df.assign(_ing=df["ingresos"].clip(lower=0).fillna(0.0), _act=df["activo_total"].fillna(0.0)).sort_values(
        [*claves, "_ing", "_act", "nit"])
    pos = ordenado.groupby(claves).cumcount()
    n = ordenado.groupby(claves)["nit"].transform("size")
    return (pos * 3 // n + 1).reindex(df.index)


def asignar(base: pd.DataFrame) -> pd.DataFrame:
    """`base`: nit, anio, ciiu_codigo, ingresos, activo_total (una fila por sociedad y año)."""
    b = base[["nit", "anio", "ciiu_codigo", "ingresos", "activo_total"]].copy()
    b["ciiu4"] = b["ciiu_codigo"]
    b["ciiu2"] = b["ciiu_codigo"].str[:2]
    con = b["ciiu4"].notna()
    n4 = b.groupby(["anio", "ciiu4"])["nit"].transform("size").where(con, 0)
    n2 = b.groupby(["anio", "ciiu2"])["nit"].transform("size").where(con, 0)
    b["n4"], b["n2"] = n4, n2
    b["tercil4"] = pd.Series(np.nan, index=b.index)
    b["tercil2"] = pd.Series(np.nan, index=b.index)
    m4 = con & (n4 >= MIN_GRUPO)
    m2 = con & (n2 >= MIN_GRUPO)
    b.loc[m4, "tercil4"] = tercil(b[m4], ["anio", "ciiu4"])
    b.loc[m2, "tercil2"] = tercil(b[m2], ["anio", "ciiu2"])
    b["nivel_pares"] = np.select([m4, m2, con & (n2 >= MIN_PARES)], ["ciiu4_tercil", "ciiu2_tercil", "ciiu2"], "ninguno")
    return b


def grupo_de_pares(b: pd.DataFrame) -> pd.DataFrame:
    """Código, tercil, tamaño y etiqueta del grupo de pares de cada fila, según su nivel."""
    nivel = b["nivel_pares"]
    codigo = pd.Series(pd.NA, index=b.index, dtype="string")
    codigo[nivel == "ciiu4_tercil"] = b["ciiu4"]
    codigo[nivel.isin(["ciiu2_tercil", "ciiu2"])] = b["ciiu2"]
    ter = b["tercil4"].where(nivel == "ciiu4_tercil", b["tercil2"].where(nivel == "ciiu2_tercil"))
    # El tamaño cuenta a toda la sociedad del grupo, también a las que usan otro nivel (los pares de la división son toda la división)
    t4 = b.groupby(["anio", "ciiu4", "tercil4"])["nit"].transform("size")
    t2 = b.groupby(["anio", "ciiu2", "tercil2"])["nit"].transform("size")
    d2 = b.groupby(["anio", "ciiu2"])["nit"].transform("size")
    tam = pd.Series(np.select([nivel == "ciiu4_tercil", nivel == "ciiu2_tercil", nivel == "ciiu2"], [t4, t2, d2], np.nan), index=b.index)
    etiqueta = pd.Series(pd.NA, index=b.index, dtype="string")
    ok = nivel != "ninguno"
    sufijo = pd.Series(np.where(ter[ok].notna(), ":T" + ter[ok].fillna(0).astype(int).astype(str), ""), index=b.index[ok])
    etiqueta[ok] = nivel[ok] + ":" + codigo[ok].astype("string") + sufijo
    return pd.DataFrame({"codigo_pares": codigo, "tercil": ter.astype("Int8"), "n_pares": tam.astype("Int32"), "grupo_pares": etiqueta})


def _percentil(df: pd.DataFrame, claves: list[str], col: str, sentido: int) -> pd.Series:
    g = df.groupby(claves)[col]
    n = g.transform("count")
    debajo = n - g.rank(method="max") if sentido < 0 else g.rank(method="min") - 1
    pct = 100.0 * debajo / n
    return pct.where(n >= MIN_PARES)


def percentiles(ind: pd.DataFrame, b: pd.DataFrame) -> pd.DataFrame:
    """`ind`: indicadores (nit, anio, …); `b`: salida de `asignar`. Devuelve nit, anio y `pct_<indicador>` (0–100, entero)."""
    d = ind[["nit", "anio", *IDS]].merge(b[["nit", "anio", "ciiu4", "ciiu2", "tercil4", "tercil2", "nivel_pares"]], on=["nit", "anio"], how="left")
    salida = d[["nit", "anio"]].copy()
    pasadas = (
        ("ciiu4_tercil", ["anio", "ciiu4", "tercil4"], d["tercil4"].notna()),
        ("ciiu2_tercil", ["anio", "ciiu2", "tercil2"], d["tercil2"].notna()),  # los pares son toda la división, no solo quienes usan este nivel
        ("ciiu2", ["anio", "ciiu2"], d["ciiu2"].notna()),
    )
    for i in IDS:
        col = pd.Series(np.nan, index=d.index)
        for nivel, claves, pertenece in pasadas:
            sub = d[pertenece]
            p = _percentil(sub, claves, i, SENTIDO[i])
            usa = d["nivel_pares"] == nivel
            col[usa] = p.reindex(d.index)[usa]
        salida[f"pct_{i}"] = col.round().astype("Int16")
    return salida


def seccion_de_division() -> dict[str, str]:
    c = catalogos.ciiu()
    return dict(zip(c.loc[c["nivel"] == "division", "codigo"], c.loc[c["nivel"] == "division", "seccion"], strict=True))


def nombre_ciiu(nivel: str, codigo: str) -> str | None:
    """Nombre del sector. Para un código de clase que la actualización 2022 subdividió, se usa el del grupo (3 dígitos)."""
    c = catalogos.ciiu()
    if nivel == "ciiu4":
        for n, cod in (("clase", codigo), ("grupo", codigo[:3]), ("division", codigo[:2])):
            f = c[(c["nivel"] == n) & (c["codigo"] == cod)]
            if len(f):
                return f["nombre"].iloc[0]
        return None
    n = {"ciiu2": "division", "seccion": "seccion"}[nivel]
    f = c[(c["nivel"] == n) & (c["codigo"] == codigo)]
    return f["nombre"].iloc[0] if len(f) else None


def vista_sector(ind: pd.DataFrame, b: pd.DataFrame, sen: pd.DataFrame, estados: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(sector_anio, sector_resumen). Tres niveles: clase CIIU (4 dígitos), división (2) y sección; solo con al menos 15 sociedades."""
    sec = seccion_de_division()
    d = ind.merge(b[["nit", "anio", "ciiu4", "ciiu2"]], on=["nit", "anio"]).merge(sen, on=["nit", "anio"]).merge(
        estados[["nit", "anio", "ingresos", "activo_total", "ganancia_neta"]], on=["nit", "anio"])
    d["perdida_neta"] = (d["ganancia_neta"] < 0).where(d["ganancia_neta"].notna()).astype("float64")
    d["patrimonio_negativo"] = d["patrimonio_negativo"].astype("float64")
    # Los informes con posible error de unidades (≈ 0,2 %) no entran a las cifras del sector: sus niveles serían absurdos
    d = d[d["ciiu4"].notna() & ~d["atipico_unidades"]].copy()
    d["seccion"] = d["ciiu2"].map(sec)
    # Panel de las mismas sociedades entre dos años: ingresos reales del año anterior = real / (1 + crecimiento)
    d["real_prev"] = d["ingresos_real"] / (1 + d["crecimiento_real_ingresos"])
    d["crece_rentable"] = ((d["crecimiento_real_ingresos"] > 0) & (d["margen_operacional"] > 0)).astype("float64")
    d.loc[d["crecimiento_real_ingresos"].isna() | d["margen_operacional"].isna(), "crece_rentable"] = np.nan
    cuant, resumen = [], []
    for nivel, col in (("ciiu4", "ciiu4"), ("ciiu2", "ciiu2"), ("seccion", "seccion")):
        g = d[d[col].notna()].groupby([col, "anio"])
        q = g[list(IDS)].quantile(list(CUANTILES)).reset_index().rename(columns={"level_2": "q", col: "codigo"})
        q = q.melt(id_vars=["codigo", "anio", "q"], var_name="indicador", value_name="v").dropna(subset=["v"])
        q["campo"] = "p" + (q["q"] * 100).round().astype(int).astype(str).str.zfill(2)
        ancho = q.pivot_table(index=["codigo", "anio", "indicador"], columns="campo", values="v").reset_index()
        cnt = g[list(IDS)].count().reset_index().melt(id_vars=[col, "anio"], var_name="indicador", value_name="n").rename(columns={col: "codigo"})
        ancho = ancho.merge(cnt, on=["codigo", "anio", "indicador"])
        ancho = ancho[ancho["n"] >= MIN_PARES].copy()
        ancho.insert(0, "nivel", nivel)
        cuant.append(ancho)

        r = g.agg(n_empresas=("nit", "size"), ingresos_total=("ingresos", "sum"), ingresos_total_real=("ingresos_real", "sum"),
                  activo_total=("activo_total", "sum"), pct_perdida_neta=("perdida_neta", "mean"),
                  pct_patrimonio_negativo=("patrimonio_negativo", "mean"), pct_crece_rentable=("crece_rentable", "mean"),
                  n_con_crecimiento=("crecimiento_real_ingresos", "count")).reset_index().rename(columns={col: "codigo"})
        panel = d[d["crecimiento_real_ingresos"].notna() & d["real_prev"].notna()].groupby([col, "anio"]).agg(
            _a=("ingresos_real", "sum"), _p=("real_prev", "sum")).reset_index().rename(columns={col: "codigo"})
        panel["crecimiento_real_panel"] = panel["_a"] / panel["_p"] - 1
        r = r.merge(panel[["codigo", "anio", "crecimiento_real_panel"]], on=["codigo", "anio"], how="left")
        r = r[r["n_empresas"] >= MIN_PARES].copy()
        r.insert(0, "nivel", nivel)
        r.insert(2, "nombre", [nombre_ciiu(nivel, c) for c in r["codigo"]])
        resumen.append(r)
    return pd.concat(cuant, ignore_index=True), pd.concat(resumen, ignore_index=True)
