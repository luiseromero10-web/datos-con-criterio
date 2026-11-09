"""Catálogo de municipios (DIVIPOLA) y población municipal (DANE) como tablas de referencia."""
from __future__ import annotations

import pandas as pd

from pipelines.common.socrata import fetch_all


def normalizar_cod_mpio(valor) -> str | None:
    """Devuelve el código DIVIPOLA de 5 dígitos ('5001' -> '05001', '05001.0' -> '05001'); None si no es válido."""
    if valor is None:
        return None
    s = str(valor).strip()
    if s.endswith(".0"):
        s = s[:-2]
    if not s.isdigit() or len(s) > 5:
        return None
    return s.zfill(5)


def _coord(x) -> float | None:
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def descargar_divipola() -> pd.DataFrame:
    df = pd.DataFrame(fetch_all("gdxc-w37w"))
    out = pd.DataFrame({
        "cod_mpio": df["cod_mpio"].map(normalizar_cod_mpio),
        "municipio": df["nom_mpio"],
        "cod_dpto": df["cod_dpto"].str.zfill(2),
        "departamento": df["dpto"],
        "tipo": df["tipo_municipio"],
        "lon": df["longitud"].map(_coord),
        "lat": df["latitud"].map(_coord),
    })
    return out.dropna(subset=["cod_mpio"])


def leer_poblacion(xlsx: str) -> pd.DataFrame:
    """Población total por municipio y año desde el xlsx del DANE (hoja PobMunicipalxÁrea)."""
    df = pd.read_excel(xlsx, sheet_name="PobMunicipalxÁrea", header=7, dtype={"MPIO": str})
    df = df[df["ÁREA GEOGRÁFICA"] == "Total"]
    return pd.DataFrame({
        "cod_mpio": df["MPIO"].map(normalizar_cod_mpio),
        "anio": df["AÑO"].astype(int),
        "poblacion": df["TOTAL"].astype(int),
    }).dropna(subset=["cod_mpio"])
