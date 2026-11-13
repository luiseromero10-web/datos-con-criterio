"""Tablas de referencia versionadas en el repositorio (`pipelines/finanzas/referencia/`), generadas desde archivos del DANE.

- `ipc_anual.csv`: índice del IPC total nacional (base dic. 2018 = 100): de diciembre y promedio de los 12 meses, por año.
  Fuente: DANE, «Índices - Serie de empalme» (anex-IPC-Indices-oct2026.xlsx).
- `ciiu_rev4ac.csv`: secciones, divisiones, grupos y clases de la CIIU Rev. 4 A.C. (actualización 2022).
  Fuente: DANE, «Estructura detallada CIIU Rev. 4 A.C.» (Estructura-detallada-CIIU-4AC-2022.xlsx).

Se versionan para que Actions no dependa de un archivo local. Cada enero, al publicar el DANE el IPC de diciembre, se vuelve
a correr `python -m pipelines.finanzas.catalogos <ipc.xlsx> <ciiu.xlsx>` con el anexo nuevo; las validaciones fallan si falta el
IPC de algún año procesado.
"""
from __future__ import annotations

import re
import sys
from functools import cache
from pathlib import Path

import openpyxl
import pandas as pd

REFERENCIA = Path(__file__).resolve().parent / "referencia"
MESES = ("Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre")


def leer_ipc(xlsx: Path) -> pd.DataFrame:
    """(anio, ipc_dic, ipc_prom, meses). Un año solo se incluye si tiene los 12 meses."""
    filas = list(openpyxl.load_workbook(xlsx, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
    cab = next(i for i, f in enumerate(filas) if f[0] == "Mes")
    anios = {j: int(a) for j, a in enumerate(filas[cab]) if isinstance(a, (int, float)) and j > 0}
    meses = {f[0]: f for f in filas[cab + 1:] if f[0] in MESES}
    salida = []
    for j, a in anios.items():
        vals = [meses[m][j] for m in MESES if m in meses and isinstance(meses[m][j], (int, float))]
        if len(vals) == 12:
            salida.append({"anio": a, "ipc_dic": float(vals[-1]), "ipc_prom": sum(vals) / 12})
    return pd.DataFrame(salida).sort_values("anio").reset_index(drop=True)


def _cod(x: object, ancho: int) -> str | None:
    """Código como texto de ancho fijo: el Excel guarda unos como número (6810) y otros como texto («0111»)."""
    if isinstance(x, (int, float)) and float(x).is_integer():
        return str(int(x)).zfill(ancho)
    return x.strip() if isinstance(x, str) and x.strip() else None


def leer_ciiu(xlsx: Path) -> pd.DataFrame:
    """(nivel, codigo, nombre, seccion, division). Niveles: seccion, division, grupo, clase."""
    filas = list(openpyxl.load_workbook(xlsx, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
    salida, seccion, division = [], None, None
    for div, grupo, clase, desc in (f[:4] for f in filas):
        desc = (desc or "").strip()
        d, g, c = _cod(div, 2), _cod(grupo, 3), _cod(clase, 4)
        if d and d.upper().startswith("SECCI"):
            seccion = d.split()[-1]
            salida.append({"nivel": "seccion", "codigo": seccion, "nombre": desc, "seccion": seccion, "division": None})
        elif d and re.fullmatch(r"\d{2}", d):
            division = d
            salida.append({"nivel": "division", "codigo": d, "nombre": desc, "seccion": seccion, "division": division})
        # un grupo con una sola clase trae las dos en la misma fila: se procesan por separado
        if g and re.fullmatch(r"\d{3}", g):
            salida.append({"nivel": "grupo", "codigo": g, "nombre": desc, "seccion": seccion, "division": division})
        if c and re.fullmatch(r"\d{4}", c):
            salida.append({"nivel": "clase", "codigo": c, "nombre": desc, "seccion": seccion, "division": division})
    return pd.DataFrame(salida)


@cache
def ipc() -> pd.DataFrame:
    return pd.read_csv(REFERENCIA / "ipc_anual.csv")


@cache
def ciiu() -> pd.DataFrame:
    return pd.read_csv(REFERENCIA / "ciiu_rev4ac.csv", dtype=str)


def main(ruta_ipc: str, ruta_ciiu: str) -> None:
    REFERENCIA.mkdir(exist_ok=True)
    i, c = leer_ipc(Path(ruta_ipc)), leer_ciiu(Path(ruta_ciiu))
    i.to_csv(REFERENCIA / "ipc_anual.csv", index=False)
    c.to_csv(REFERENCIA / "ciiu_rev4ac.csv", index=False)
    print("IPC:", i["anio"].min(), "-", i["anio"].max(), "| CIIU:", c["nivel"].value_counts().to_dict())


if __name__ == "__main__":
    main(*sys.argv[1:3])
