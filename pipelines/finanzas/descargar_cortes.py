"""Descarga los cortes de la base de insolvencia listados en `insolvencia_cortes.json` a data/finanzas/insolvencia_raw/.

Solo baja los que faltan y comprueba que cada uno sea un Excel (.xlsx) legible. Los archivos no se versionan.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import openpyxl
import requests

from pipelines.finanzas.config import DATA

LISTA = Path(__file__).with_name("insolvencia_cortes.json")
DESTINO = DATA / "insolvencia_raw"


def main(solo_faltantes: bool = True) -> int:
    cfg = json.loads(LISTA.read_text(encoding="utf-8"))
    DESTINO.mkdir(parents=True, exist_ok=True)
    malos = 0
    for c in cfg["cortes"]:
        ruta = DESTINO / c["archivo"]
        if solo_faltantes and ruta.exists() and ruta.stat().st_size > 10_000:
            continue
        r = requests.get(cfg["base"] + c["ruta"], timeout=120)
        r.raise_for_status()
        ruta.write_bytes(r.content)
        try:
            hojas = openpyxl.load_workbook(ruta, read_only=True).sheetnames
            print(f"{c['archivo']}: {len(r.content) / 1e6:.2f} MB, hojas {hojas}")
        except Exception as e:  # noqa: BLE001 - se informa y se sigue con el resto
            malos += 1
            print(f"{c['archivo']}: NO es un Excel legible ({e})")
    return 1 if malos else 0


if __name__ == "__main__":
    sys.exit(main())
