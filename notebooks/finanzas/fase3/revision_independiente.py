"""Revisión independiente de indicadores y percentiles para cinco empresas de sectores distintos (corte 2024).

NO usa el código de `pipelines.finanzas`: baja los estados directamente de la API de datos.gov.co, recalcula cada indicador con
fórmulas escritas aquí y los compara con `gold/indicadores.parquet`; los percentiles se recalculan contando pares en
`gold/pares.parquet` e `indicadores.parquet`. Escribe docs/finanzas/revision_5_empresas.md con las cifras base, para que el autor
las pueda cotejar con el SIIS de la Supersociedades.

Uso: python notebooks/finanzas/fase3/revision_independiente.py
"""
import statistics
import sys
from pathlib import Path

import openpyxl
import pandas as pd
import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
RAIZ = Path(__file__).resolve().parents[3]
GOLD = RAIZ / "data" / "finanzas" / "gold"
API = "https://www.datos.gov.co/resource"
ANIO = 2024
EMPRESAS = {900480569: "Jerónimo Martins Colombia (comercio al por menor)", 802021332: "Clínica Centro (salud)",
            800086042: "Inacar (construcción de edificios)", 800068713: "Oleoducto de Colombia (transporte por tuberías)",
            891900129: "Ingenio San Carlos (elaboración de azúcar)"}

# Rubros (con «_» donde la fuente daña una letra acentuada)
ESF = {"activo": "Total de activos", "activo_corr": "Activos corrientes totales", "pasivo": "Total pasivos", "pasivo_corr": "Pasivos corrientes totales",
       "patrimonio": "Patrimonio total", "inventarios": "Inventarios corrientes",
       "cxc": "Cuentas comerciales por cobrar y otras cuentas por cobrar corrientes",
       "cxp": "Cuentas por pagar comerciales y otras cuentas por pagar corrientes"}
ERI = {"ingresos": "Ingresos de actividades ordinarias", "costo": "Costo de ventas", "operacional": "Ganancia (p_rdida) por actividades de operaci_n",
       "costos_fin": "Costos financieros", "neta": "Ganancia (p_rdida)"}
EFE = {"flujo_op": "Flujos de efectivo netos procedentes de (utilizados en) actividades de operaci_n"}


def traer(dataset: str, nit: int, anio: int, rubros: dict[str, str]) -> dict[str, float]:
    filtro = " OR ".join(f"concepto like '{r}'" for r in rubros.values())
    r = requests.get(f"{API}/{dataset}.json", params={
        "$where": f"nit={nit} AND fecha_corte='{anio}-12-31' AND periodo='Periodo Actual' AND punto_entrada like '%Individual%' AND ({filtro})",
        "$select": "concepto, valor", "$limit": 500}, timeout=120)
    r.raise_for_status()
    crudo = {x["concepto"]: float(x["valor"]) * 1000 for x in r.json()}  # miles de pesos -> pesos
    salida = {}
    for k, patron in rubros.items():
        casan = [v for c, v in crudo.items() if len(c) == len(patron) and all(a == b or b == "_" for a, b in zip(c, patron, strict=False))]
        if casan:
            salida[k] = statistics.mean(casan)
    return salida


def ipc_promedio() -> dict[int, float]:
    ws = openpyxl.load_workbook(RAIZ / "data/finanzas/ref/dane/ipc_indices_oct2026.xlsx", read_only=True, data_only=True).worksheets[0]
    filas = list(ws.iter_rows(values_only=True))
    cab = next(i for i, f in enumerate(filas) if f[0] == "Mes")
    meses = [f for f in filas[cab + 1: cab + 13]]
    return {int(a): statistics.mean(m[j] for m in meses) for j, a in enumerate(filas[cab]) if isinstance(a, (int, float)) and a >= 2003 and all(isinstance(m[j], (int, float)) for m in meses)}


def estados(nit: int, anio: int) -> dict[str, float]:
    return {**traer("pfdp-zks5", nit, anio, ESF), **traer("prwj-nzxa", nit, anio, ERI), **traer("ctcp-462n", nit, anio, EFE)}


def calcular(a: dict[str, float], previo: dict[str, float], ipc: dict[int, float]) -> dict[str, float | None]:
    g = a.get

    def div(n: float | None, d: float | None) -> float | None:
        return None if n is None or not d else n / d  # sin dato o denominador cero -> vacío (nunca infinito)

    cr: dict[str, float | None] = {
        "margen_neto": div(g("neta"), g("ingresos")),
        "margen_operacional": div(g("operacional"), g("ingresos")),
        "roa": div(g("neta"), g("activo")),
        "roe": div(g("neta"), g("patrimonio")),
        "razon_corriente": div(g("activo_corr"), g("pasivo_corr")),
        "prueba_acida": div(g("activo_corr") - g("inventarios", 0.0) if g("activo_corr") is not None else None, g("pasivo_corr")),
        "endeudamiento": div(g("pasivo"), g("activo")),
        "apalancamiento": div(g("pasivo"), g("patrimonio")),
        "dias_cartera": div(g("cxc", 0.0) * 365, g("ingresos")),
        "flujo_operacion_ingresos": div(g("flujo_op"), g("ingresos")),
        "dias_inventario": div(g("inventarios", 0.0) * 365, g("costo")),
        "dias_proveedores": div(g("cxp", 0.0) * 365, g("costo")),
        "cobertura_intereses": div(g("operacional"), g("costos_fin")),
    }
    if previo.get("ingresos") and g("ingresos"):
        cr["crecimiento_real_ingresos"] = (g("ingresos") / ipc[ANIO]) / (previo["ingresos"] / ipc[ANIO - 1]) - 1
    return cr


def pool_de_pares(nit: int, par: pd.DataFrame, base: pd.DataFrame) -> pd.Index:
    """NIT de los pares de una sociedad, recreados desde las reglas del plan (sin usar el código del pipeline)."""
    fila = par[par["nit"] == nit].iloc[0]
    if fila["nivel_pares"] == "ciiu4_tercil":
        return par.loc[par["grupo_pares"] == fila["grupo_pares"], "nit"]
    division = base.loc[base["nit"] == nit, "ciiu_codigo"].iloc[0][:2]
    miembros = base[base["ciiu_codigo"].str[:2] == division].copy()
    if fila["nivel_pares"] == "ciiu2":
        return miembros["nit"]
    # terciles de ingresos de TODA la división (empate: activo y luego NIT)
    orden = miembros.assign(i=miembros["ingresos"].clip(lower=0).fillna(0), a=miembros["activo_total"].fillna(0)).sort_values(["i", "a", "nit"])
    orden["tercil"] = [pos * 3 // len(orden) + 1 for pos in range(len(orden))]
    propio = orden.loc[orden["nit"] == nit, "tercil"].iloc[0]
    return orden.loc[orden["tercil"] == propio, "nit"]


def percentil(valor: float, pares: pd.Series, menos_es_mejor: bool) -> int:
    pares = pares.dropna()
    contra = (pares > valor) if menos_es_mejor else (pares < valor)
    return round(100 * contra.sum() / len(pares))


def main() -> None:
    ipc = ipc_promedio()
    ind = pd.read_parquet(GOLD / "indicadores.parquet")
    par = pd.read_parquet(GOLD / "pares.parquet")
    ind = ind[ind["anio"] == ANIO].merge(par[par["anio"] == ANIO][["nit", "grupo_pares", "n_pares"]], on="nit")
    todo = ind.merge(par[par["anio"] == ANIO][[c for c in par.columns if c.startswith("pct_")] + ["nit"]], on="nit")
    par = par[par["anio"] == ANIO]
    base = pd.read_parquet(GOLD / "estados.parquet", columns=["nit", "anio", "ingresos", "activo_total"]).merge(
        pd.read_parquet(GOLD / "empresas_anio.parquet", columns=["nit", "anio", "ciiu_codigo"]), on=["nit", "anio"])
    base = base[(base["anio"] == ANIO) & base["ciiu_codigo"].notna()]
    L = ["# Revisión independiente de 5 empresas (corte 2024)", "",
         ("Cada indicador se recalculó **sin usar el código del pipeline**: las cifras se bajaron de nuevo de la API de datos.gov.co "
          "(estado individual, periodo actual) y las fórmulas se escribieron aparte (`notebooks/finanzas/fase3/revision_independiente.py`). "
          "Los percentiles se recalcularon contando pares en las tablas publicadas. Valores en pesos corrientes; razones en veces o fracción."), ""]
    mal = 0
    for nit, nombre in EMPRESAS.items():
        a, p = estados(nit, ANIO), estados(nit, ANIO - 1)
        mio = calcular(a, p, ipc)
        fila = todo[todo["nit"] == nit].iloc[0]
        grupo = todo[todo["nit"].isin(pool_de_pares(nit, par, base))]
        mal += len(grupo) != int(fila["n_pares"])  # el tamaño del grupo recreado debe coincidir con el publicado
        L += [f"## {nombre} — NIT {nit}", "",
              f"Grupo de pares: `{fila['grupo_pares']}` ({int(fila['n_pares'])} sociedades publicadas; {len(grupo)} al recrearlo).", "",
              "| Cifra del estado (miles de millones de pesos) | Valor |", "|---|---|",
              *[f"| {k} | {v / 1e9:,.3f} |" for k, v in a.items()], "",
              "| Indicador | Recalculado | En gold | Diferencia | Percentil recalculado | Percentil en gold |", "|---|---|---|---|---|---|"]
        for k, v in mio.items():
            oro = fila[k]
            if v is None:  # el recálculo no tiene dato: gold también debe estar vacío
                mal += not pd.isna(oro)
                L.append(f"| {k} | (sin dato) | {'(vacío)' if pd.isna(oro) else f'{oro:,.4f}'} | {'ok' if pd.isna(oro) else 'DIFERENCIA'} | | |")
                continue
            if pd.isna(oro):
                mal += 1
                L.append(f"| {k} | {v:,.4f} | (vacío) | DIFERENCIA | | |")
                continue
            dif = abs(v - oro) / max(abs(v), 1e-12)
            mal += dif > 1e-6
            menos = k in ("endeudamiento", "apalancamiento", "dias_cartera", "dias_inventario")
            neutro = k == "dias_proveedores"
            pc = percentil(v, grupo[k], menos) if not neutro else percentil(v, grupo[k], False)
            pg = fila[f"pct_{k}"]
            mal += (not pd.isna(pg)) and abs(pc - pg) > 1
            L.append(f"| {k} | {v:,.4f} | {oro:,.4f} | {dif:.1e} | {pc} | {'' if pd.isna(pg) else int(pg)} |")
        L.append("")
    L += [f"**Resultado:** {'sin diferencias' if mal == 0 else f'{mal} diferencias por revisar'} (tolerancia relativa 1e-6 en los indicadores y ±1 punto en los percentiles).", ""]
    (RAIZ / "docs" / "finanzas" / "revision_5_empresas.md").write_text("\n".join(L), encoding="utf-8")
    print("\n".join(L))
    sys.exit(1 if mal else 0)


if __name__ == "__main__":
    main()
