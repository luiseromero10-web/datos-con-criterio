"""Ingesta a bronze: un Parquet por delito/año/mes, incremental (refresca los últimos meses)."""
from __future__ import annotations

import sys
from datetime import date

import pandas as pd
from dotenv import load_dotenv

from pipelines.common.socrata import fetch_all
from pipelines.seguridad.config import ANIO_INICIO, DATA, DELITOS, MESES_A_REFRESCAR

load_dotenv()


def _meses(hasta: date):
    for a in range(ANIO_INICIO, hasta.year + 1):
        for m in range(1, 13):
            if (a, m) <= (hasta.year, hasta.month):
                yield a, m


def _rango(a: int, m: int) -> tuple[str, str]:
    ini = f"{a}-{m:02d}-01T00:00:00"
    a2, m2 = (a + 1, 1) if m == 12 else (a, m + 1)
    return ini, f"{a2}-{m2:02d}-01T00:00:00"


def main(delitos: list[str] | None = None) -> None:
    hoy = date.today()
    meses = list(_meses(hoy))
    recientes = set(meses[-MESES_A_REFRESCAR:])
    for nombre in delitos or DELITOS:
        ds = DELITOS[nombre]
        total = 0
        for a, m in meses:
            destino = DATA / "bronze" / nombre / f"anio={a}" / f"mes={m:02d}.parquet"
            if destino.exists() and (a, m) not in recientes:
                continue
            ini, fin = _rango(a, m)
            filas = fetch_all(ds, where=f"fecha_hecho >= '{ini}' AND fecha_hecho < '{fin}'")
            destino.parent.mkdir(parents=True, exist_ok=True)
            df = pd.DataFrame(filas).astype(str) if filas else pd.DataFrame({"fecha_hecho": []})
            df.to_parquet(destino, index=False)
            total += len(df)
        print(f"{nombre}: {total} filas nuevas/refrescadas")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
