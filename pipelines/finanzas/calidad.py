"""Criterios de aceptación de la Fase 1; escribe docs/finanzas/calidad_fase1.md.

1. Conciliación con `6cat-2gcs` (10 000 empresas más grandes): ingresos y activos, mediana del error < 1 %.
   Sus cifras vienen en billones con 2 decimales: se mide sobre las de >= 0,5 billones de activos (error de redondeo <= 1 %).
2. >= 95 % de los informes individuales de cada año con las ocho variables núcleo.
3. Identidad contable (activo = pasivo + patrimonio) en >= 99 %.
4. Ningún dato de contacto en bronze, silver ni gold.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from pipelines.finanzas import conceptos as cp
from pipelines.finanzas.config import DATA

DOCS = Path(__file__).resolve().parents[2] / "docs" / "finanzas"
MIN_BILLONES = 0.5  # activos mínimos en `6cat-2gcs` para que el redondeo (±0,005) no pase de 1 %
TOLERANCIA_IDENTIDAD = 3_000  # pesos: tres cifras redondeadas a miles
# NIT con estado individual por corte, medidos en la Fase 0 directamente contra la API (fuentes.md, sección 3)
INDIVIDUALES_FASE0 = {2016: 20284, 2017: 17103, 2018: 16717, 2019: 22481, 2020: 26725, 2021: 26070, 2022: 27749,
                      2023: 27870, 2024: 25866, 2025: 25613}


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype(str).str.replace("$", "", regex=False).str.replace(",", "", regex=False), errors="coerce")


def nucleo(e: pd.DataFrame) -> pd.DataFrame:
    filas = []
    for anio, g in e.groupby("anio"):
        ind = g[g["tipo_estado"] == "individual"]
        fila = {"anio": anio, "individuales": len(ind), "todas_las_8": float(ind[list(cp.NUCLEO)].notna().all(axis=1).mean())}
        for v in cp.NUCLEO:
            fila[v] = float(ind[v].notna().mean())
        filas.append(fila)
    return pd.DataFrame(filas)


def identidad(e: pd.DataFrame) -> pd.DataFrame:
    d = e.dropna(subset=["activo_total", "pasivo_total", "patrimonio"]).copy()
    d["dif"] = (d["activo_total"] - d["pasivo_total"] - d["patrimonio"]).abs()
    d["cumple"] = d["dif"] <= TOLERANCIA_IDENTIDAD
    d["cumple_rel"] = d["dif"] <= d["activo_total"].abs() * 0.001
    out = d.groupby("anio").agg(informes=("nit", "size"), cumple=("cumple", "mean"), cumple_relativo=("cumple_rel", "mean"))
    out["sin_las_tres"] = e.groupby("anio").size() - out["informes"]
    return out.reset_index()


def conciliar(e: pd.DataFrame, ea: pd.DataFrame, data: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    g = pd.read_parquet(data / "bronze" / "grandes" / "grandes.parquet")
    g = g[g["supervisor"].str.upper() == "SUPERSOCIEDADES"].copy()
    g["nit"] = _num(g["nit"]).astype("Int64")
    g["anio"] = _num(g["a_o_de_corte"]).astype("Int64")
    for c, n in (("total_activos", "activos_b"), ("ingresos_operacionales", "ingresos_b"), ("total_patrimonio", "patrimonio_b")):
        g[n] = _num(g[c])
    m = g.merge(e, on=["nit", "anio"], how="left").merge(ea[["nit", "anio", "razon_social"]], on=["nit", "anio"], how="left")
    m["activos_ours_b"] = m["activo_total"] / 1e12
    m["ingresos_ours_b"] = m["ingresos"] / 1e12
    m["ingresos_mas_otros_b"] = (m["ingresos"] + m["otros_ingresos"].fillna(0)) / 1e12
    m["patrimonio_ours_b"] = m["patrimonio"] / 1e12
    for k in ("activos", "ingresos", "patrimonio"):
        m[f"err_{k}"] = (m[f"{k}_ours_b"] - m[f"{k}_b"]).abs() / m[f"{k}_b"].abs()
    m["err_ingresos_mas_otros"] = (m["ingresos_mas_otros_b"] - m["ingresos_b"]).abs() / m["ingresos_b"].abs()
    m["grande"] = m["activos_b"] >= MIN_BILLONES
    return m, g


def resumen_conciliacion(m: pd.DataFrame) -> pd.DataFrame:
    filas = []
    for anio, x in m.groupby("anio"):
        sel = x[x["grande"]]
        fila = {"anio": int(anio), "en_6cat": len(x), "cruzan": int(x["activo_total"].notna().sum()),
                "grandes": len(sel), "grandes_cruzan": int(sel["activo_total"].notna().sum())}
        for k in ("activos", "ingresos", "ingresos_mas_otros", "patrimonio"):
            base = sel if k != "patrimonio" else x[x["patrimonio_b"] >= MIN_BILLONES]  # el redondeo pesa sobre el patrimonio
            e = base[f"err_{k}"].dropna()
            fila[f"mediana_{k}"] = float(e.median()) if len(e) else float("nan")
            fila[f"mayor5_{k}"] = int((e > 0.05).sum())
        filas.append(fila)
    return pd.DataFrame(filas)


def contacto(data: Path) -> list[str]:
    """Hallazgos de datos de contacto: debe volver vacía."""
    malos: list[str] = []
    permitidas = {cp.clave(v) for v in cp.CAMPOS_CARATULA.values()}
    car = pd.concat([pd.read_parquet(f, columns=["concepto"]) for f in sorted((data / "bronze" / "caratula").glob("anio=*.parquet"))])
    for c in car["concepto"].unique():
        if cp.clave(c) not in permitidas:
            malos.append(f"bronze/caratula: rubro fuera de la lista blanca: {c}")
    for capa in ("silver", "gold"):
        for f in sorted((data / capa).glob("*.parquet")):
            for col in pd.read_parquet(f).columns:
                if any(p in cp.clave(col) for p in cp.PROHIBIDAS_CONTACTO):
                    malos.append(f"{capa}/{f.name}: columna {col}")
    return malos


def pct(x: float) -> str:
    return "–" if pd.isna(x) else f"{100 * x:.1f} %"


def main(data: Path = DATA) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    e = pd.read_parquet(data / "gold" / "estados.parquet")
    ea = pd.read_parquet(data / "gold" / "empresas_anio.parquet")
    aud = pd.read_parquet(data / "silver" / "auditoria_anio.parquet")
    nuc, ide = nucleo(e), identidad(e)
    m, _ = conciliar(e, ea, data)
    con = resumen_conciliacion(m)
    malos = contacto(data)

    ok_nucleo = bool((nuc["todas_las_8"] >= 0.95).all())
    ok_ident = bool((ide["cumple"] >= 0.99).all())
    ok_conc = bool((con["mediana_activos"] < 0.01).all() and (con["mediana_ingresos_mas_otros"] < 0.01).all())
    ok_contacto = not malos

    L: list[str] = ["# Calidad de la Fase 1 — ingesta y transformación", "",
                    f"Generado por `pipelines/finanzas/calidad.py` sobre `{data.name}/`. Pesos corrientes; fuente en miles de pesos (×1 000).", ""]
    L += ["## Resumen de criterios", "",
          "| Criterio | Resultado |", "|---|---|",
          f"| Conciliación con `6cat-2gcs` (mediana del error < 1 %, activos ≥ {MIN_BILLONES} billones) | {'cumple' if ok_conc else 'NO cumple'} |",
          f"| ≥ 95 % de los informes individuales con las 8 variables núcleo, cada año | {'cumple' if ok_nucleo else 'NO cumple'} |",
          f"| Identidad activo = pasivo + patrimonio ≥ 99 % (±{TOLERANCIA_IDENTIDAD:,} pesos), cada año | {'cumple' if ok_ident else 'NO cumple'} |",
          f"| Sin datos de contacto en bronze, silver ni gold | {'cumple' if ok_contacto else 'NO cumple'} |", ""]

    L += ["## Informes por año", "",
          "| Año | Informes (individual+separado) | NIT | Elegidos | Individual | Separado | Descartados | Individuales (Fase 0) | Filas repetidas en la fuente | Claves con valores distintos |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for r in aud.itertuples():
        esp = INDIVIDUALES_FASE0.get(int(r.anio))
        L.append(f"| {r.anio} | {r.informes_individual_separado:,} | {r.nit_distintos:,} | {int(r.informes_elegidos):,} | {int(r.elegidos_individual):,} | "
                 f"{int(r.elegidos_separado):,} | {int(r.informes_descartados):,} | {esp:,} | {r.filas_repetidas:,} ({pct(r.filas_repetidas / r.filas_mapeadas)}) | {r.claves_con_valores_distintos:,} |")
    L += ["", "«Individuales (Fase 0)» son los NIT con estado individual contados en la Fase 0 directamente contra la API; deben coincidir con «Individual» (cuando no hay informes individuales repetidos).", ""]

    L += ["## Variables núcleo (informes individuales)", "", "| Año | Informes | Las 8 | " + " | ".join(cp.NUCLEO) + " |",
          "|---|---|---|" + "---|" * len(cp.NUCLEO)]
    for r in nuc.itertuples():
        L.append(f"| {r.anio} | {r.individuales:,} | **{pct(r.todas_las_8)}** | " + " | ".join(pct(getattr(r, v)) for v in cp.NUCLEO) + " |")

    L += ["", "## Identidad contable", "", f"| Año | Informes con las 3 cifras | Cumple (±{TOLERANCIA_IDENTIDAD:,} pesos) | Cumple (±0,1 % del activo) | Sin las 3 cifras |", "|---|---|---|---|---|"]
    for r in ide.itertuples():
        L.append(f"| {r.anio} | {r.informes:,} | **{pct(r.cumple)}** | {pct(r.cumple_relativo)} | {r.sin_las_tres:,} |")

    L += ["", f"## Conciliación con `6cat-2gcs` (Supersociedades, activos ≥ {MIN_BILLONES} billones)", "",
          "`6cat-2gcs` suma «ingresos operacionales» con una definición que no documenta; se compara con los ingresos de actividades ordinarias y con ordinarios + otros ingresos.", "",
          "| Año | En 6cat | Cruzan por NIT | Grandes | Grandes que cruzan | Mediana error activos | Mediana error ingresos ordinarios | Mediana error ordinarios + otros | Mediana error patrimonio | >5 % activos | >5 % ordinarios | >5 % ordinarios + otros | >5 % patrimonio |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in con.itertuples():
        L.append(f"| {r.anio} | {r.en_6cat:,} | {r.cruzan:,} | {r.grandes:,} | {r.grandes_cruzan:,} | **{pct(r.mediana_activos)}** | {pct(r.mediana_ingresos)} | "
                 f"**{pct(r.mediana_ingresos_mas_otros)}** | {pct(r.mediana_patrimonio)} | {r.mayor5_activos} | {r.mayor5_ingresos} | {r.mayor5_ingresos_mas_otros} | {r.mayor5_patrimonio} |")
    g5 = m[m["grande"] & m["activo_total"].notna()]
    L += ["", "### Por tipo de estado (todos los años, activos ≥ 0,5 billones)", "",
          "| Estado usado | Casos | Mediana error ordinarios + otros | >5 % ordinarios + otros | De ellos, 6cat mayor que lo propio |", "|---|---|---|---|---|"]
    for tipo, x in g5.groupby("tipo_estado"):
        mal = x[x["err_ingresos_mas_otros"] > 0.05]
        L.append(f"| {tipo} | {len(x):,} | {pct(x['err_ingresos_mas_otros'].median())} | {len(mal)} ({pct(len(mal) / len(x))}) | "
                 f"{int((mal['ingresos_b'] > mal['ingresos_mas_otros_b']).sum())} |")
    L += ["", ("Hipótesis (no verificada): en los estados separados, `6cat-2gcs` parece informar ingresos de un perímetro mayor (grupo); "
               "los activos y el patrimonio, que no cambian de definición, concilian en todos los casos.")]
    cas = m[m["grande"] & ((m["err_activos"] > 0.05) | (m["err_ingresos_mas_otros"] > 0.05) | (m["err_patrimonio"] > 0.05))].sort_values("activos_b", ascending=False).head(25)
    L += ["", "### Casos con diferencia mayor al 5 % (los 25 más grandes)", "",
          "| Año | NIT | Razón social | Estado usado | Activos 6cat (bill.) | Activos propios | Ingresos 6cat | Ordinarios + otros | Patrimonio 6cat | Patrimonio propio |", "|---|---|---|---|---|---|---|---|---|---|"]
    for r in cas.itertuples():
        L.append(f"| {r.anio} | {r.nit} | {str(r.razon_social)[:40]} | {r.tipo_estado} | {r.activos_b:.2f} | {r.activos_ours_b:.2f} | {r.ingresos_b:.2f} | {r.ingresos_mas_otros_b:.2f} | {r.patrimonio_b:.2f} | {r.patrimonio_ours_b:.2f} |")
    sin = m[m["grande"] & m["activo_total"].isna()]
    L += ["", f"Grandes de `6cat-2gcs` sin informe en nuestros estados: {len(sin)} (de {int(m['grande'].sum())}).", ""]

    L += ["## Identidad de las sociedades (gold/empresas_anio)", "",
          "| Año | Sociedades | Con municipio DIVIPOLA | Con CIIU propio | Con CIIU heredado | Sin CIIU | Con razón social |", "|---|---|---|---|---|---|---|"]
    for anio, x in ea.groupby("anio"):
        origen = x["ciiu_origen"].fillna("sin").str.slice(0, 9)
        L.append(f"| {anio} | {len(x):,} | {pct(x['cod_mpio'].notna().mean())} | {pct((origen == 'propio').mean())} | "
                 f"{pct((origen == 'heredado_').mean())} | {pct((origen == 'sin').mean())} | {pct(x['razon_social'].notna().mean())} |")
    L += [""]

    L += ["## Datos de contacto", "", "Sin hallazgos." if ok_contacto else "\n".join(f"- {x}" for x in malos), ""]
    (DOCS / "calidad_fase1.md").write_text("\n".join(L), encoding="utf-8")
    print("\n".join(L[:12]))
    return 0 if (ok_nucleo and ok_ident and ok_conc and ok_contacto) else 1


if __name__ == "__main__":
    sys.exit(main())
