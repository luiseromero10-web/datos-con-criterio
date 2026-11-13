"""Aplica el modelo de alerta guardado y publica SOLO cifras agregadas (gold/alerta_agregada.parquet).

No se publica el puntaje de ninguna sociedad (decisión del autor, plan 0.2): un puntaje individual se lee como calificación crediticia y
puede dañar a una empresa real. Se publica, por sector, región y tamaño y por año, qué proporción de las sociedades muestra un perfil
de riesgo alto, es decir, una probabilidad calibrada por encima de un umbral fijo (el percentil 95 de 2020–2021), y la probabilidad media.
Los grupos de menos de 30 sociedades no se publican. Las sociedades que ya están en un proceso de insolvencia (estado de la carátula
distinto de «ACTIVA») no entran en estas cifras.

Solo necesita el modelo versionado en models/finanzas/artifacts/ y el gold; no usa la base de insolvencia (por eso corre en Actions).
`tasa_observada` (admisiones reales en los 24 meses siguientes) viene de `artifacts/historia_agregada.parquet`, calculada al entrenar.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

from models.finanzas import datos
from models.finanzas.modelos import ModeloAltman, ModeloLgbm, ModeloLogit
from pipelines.finanzas import pares
from pipelines.finanzas.config import DATA

ARTEFACTOS = Path(__file__).with_name("artifacts")
MIN_GRUPO = 30
DIMENSIONES = ("total", "seccion", "ciiu2", "departamento", "tamano")
ETIQUETA_TAMANO = {"bajo": "Ingresos bajos (tercio inferior del año)", "medio": "Ingresos medios", "alto": "Ingresos altos (tercio superior del año)"}
MUESTRAS = ((2019, "entrenamiento"), (2021, "validacion"), (2023, "prueba"))


def cargar_modelo(carpeta: Path = ARTEFACTOS):
    sel = json.loads((carpeta / "seleccion.json").read_text(encoding="utf-8"))
    tipo = sel["publicado"]
    if tipo == "lgbm":
        return ModeloLgbm.cargar(carpeta), sel
    datos_json = json.loads((carpeta / f"{tipo}.json").read_text(encoding="utf-8"))
    return (ModeloAltman.de_json(datos_json) if tipo == "altman" else ModeloLogit.de_json(datos_json)), sel


def muestra(anio: int) -> str:
    for hasta, nombre in MUESTRAS:
        if anio <= hasta:
            return nombre
    return "sin_etiqueta"


def preparar(base: pd.DataFrame, estado: pd.DataFrame, modelo, umbral: float) -> pd.DataFrame:
    """Una fila por sociedad-año con su probabilidad y las dimensiones de agregación. Solo en memoria: no se escribe por sociedad."""
    d = base.merge(estado[["nit", "anio", "estado_actual"]], on=["nit", "anio"], how="left")
    d["p"] = modelo.probabilidad(d)
    d["alto"] = d["p"] >= umbral
    d["total"] = "nacional"
    d["ciiu2"] = d["seccion"].where(d["seccion"].isna(), d["ciiu_division"])
    terciles = d.groupby("anio")["log_ingresos"].transform(lambda s: pd.qcut(s.rank(method="first"), 3, labels=["bajo", "medio", "alto"]))
    d["tamano"] = terciles.astype("string")
    return d[d["p"].notna()]


def agregar(d: pd.DataFrame, con_etiqueta: bool = False) -> pd.DataFrame:
    """Cifras por dimensión, código y año; solo grupos de al menos MIN_GRUPO sociedades."""
    partes = []
    for dim in DIMENSIONES:
        x = d[d[dim].notna()]
        if con_etiqueta:
            x = x[x["y"].notna()]
        g = x.groupby([dim, "anio"])
        if con_etiqueta:
            r = g.agg(n_con_etiqueta=("y", "size"), n_eventos=("y", "sum")).reset_index()
            r["tasa_observada"] = r["n_eventos"] / r["n_con_etiqueta"]
            r = r.rename(columns={dim: "codigo"})
            n = r["n_con_etiqueta"]
        else:
            r = g.agg(n_empresas=("p", "size"), p_media=("p", "mean"), n_perfil_alto=("alto", "sum")).reset_index().rename(columns={dim: "codigo"})
            r["pct_perfil_alto"] = r["n_perfil_alto"] / r["n_empresas"]
            n = r["n_empresas"]
        r.insert(0, "dimension", dim)
        partes.append(r[n >= MIN_GRUPO])
    return pd.concat(partes, ignore_index=True)


def nombre(dimension: str, codigo: str) -> str | None:
    if dimension == "total":
        return "Todas las sociedades"
    if dimension == "tamano":
        return ETIQUETA_TAMANO.get(codigo)
    if dimension == "departamento":
        return codigo
    return pares.nombre_ciiu({"seccion": "seccion", "ciiu2": "ciiu2"}[dimension], codigo)


def historia(base: pd.DataFrame, estado: pd.DataFrame) -> pd.DataFrame:
    """Tasa observada de admisión a un proceso por grupo y año (con los eventos reales): se calcula al entrenar y se versiona."""
    d = base[~base["ya_admitida"] & base["y"].notna()].merge(estado[["nit", "anio"]], on=["nit", "anio"], how="left")
    d["total"] = "nacional"
    d["ciiu2"] = d["seccion"].where(d["seccion"].isna(), d["ciiu_division"])
    d["tamano"] = d.groupby("anio")["log_ingresos"].transform(lambda s: pd.qcut(s.rank(method="first"), 3, labels=["bajo", "medio", "alto"])).astype("string")
    return agregar(d, con_etiqueta=True)


def copiar_metricas(carpeta: Path, gold: Path) -> None:
    """Las métricas de validación del modelo viajan con los datos: la página de metodología las lee de ahí (sin datos de sociedades)."""
    m = json.loads((carpeta / "metrics.json").read_text(encoding="utf-8"))
    (gold / "alerta_metricas.json").write_text(json.dumps(m, ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8")


def main(data: Path = DATA, carpeta: Path = ARTEFACTOS) -> pd.DataFrame:
    modelo, sel = cargar_modelo(carpeta)
    umbral = sel["umbral_perfil_alto"]
    sin_eventos = pd.DataFrame(columns=["nit", "anio_admision", "familia", "precision"]).astype({"nit": "int64", "anio_admision": "Int64"})
    base = datos.construir(data, eventos=sin_eventos)
    ea = pd.read_parquet(data / "gold" / "empresas_anio.parquet", columns=["nit", "anio", "estado_actual"])
    d = preparar(base, ea, modelo, umbral)
    d = d[d["estado_actual"].isna() | (d["estado_actual"] == "ACTIVA")]  # las que ya están en un proceso no entran
    out = agregar(d)
    hist_ruta = carpeta / "historia_agregada.parquet"
    if hist_ruta.exists():
        out = out.merge(pd.read_parquet(hist_ruta), on=["dimension", "codigo", "anio"], how="left")
    out["nombre"] = [nombre(a, b) for a, b in zip(out["dimension"], out["codigo"], strict=True)]
    out["muestra"] = out["anio"].map(muestra)
    out["umbral"] = umbral
    out["modelo"] = sel["publicado"]
    cols = ["dimension", "codigo", "nombre", "anio", "muestra", "n_empresas", "p_media", "pct_perfil_alto", "n_perfil_alto", "umbral", "modelo",
            *[c for c in ("n_con_etiqueta", "n_eventos", "tasa_observada") if c in out]]
    out = out[cols].sort_values(["dimension", "codigo", "anio"]).reset_index(drop=True)
    (data / "gold").mkdir(parents=True, exist_ok=True)
    out.to_parquet(data / "gold" / "alerta_agregada.parquet", index=False, compression="zstd")
    copiar_metricas(carpeta, data / "gold")
    return out


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    r = main()
    print(f"alerta_agregada: {len(r):,} filas, {r['dimension'].value_counts().to_dict()}, años {int(r['anio'].min())}–{int(r['anio'].max())}")
    x = r[(r["dimension"] == "total") & r["anio"].between(2019, 2025)]
    print(x[["anio", "muestra", "n_empresas", "p_media", "pct_perfil_alto", *[c for c in ("tasa_observada",) if c in x]]].round(4).to_string(index=False))
