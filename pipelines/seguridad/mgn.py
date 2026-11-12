"""Descarga los polígonos municipales del MGN 2018 (DANE) a data/raw/mgn_municipios_2018.geojson.

Fuente: https://portalgis.dane.gov.co/mparcgis/rest/services/MGN2018/Serv_CapaMunicipiosInt_2018/MapServer/0
(enlazada desde datos.gov.co, conjunto dnxb-k5pj). Se piden solo los campos necesarios, en WGS84 y con simplificación
en el servidor (~55 m) para que el archivo sea manejable; basta para contigüidad y para el mapa.
"""
from __future__ import annotations

import json
import os
import sys

import requests

from pipelines.seguridad.config import DATA

URL = "https://portalgis.dane.gov.co/mparcgis/rest/services/MGN2018/Serv_CapaMunicipiosInt_2018/MapServer/0/query"
CAMPOS = "MPIO_CDPMP,MPIO_CNMBR,DPTO_CCDGO,AREA"
# Copia en R2 (vigencia fija 2018). El servidor del DANE corta la conexión desde los runners de GitHub (SSLEOFError), por eso la
# ingesta lee de aquí; el DANE queda como origen para refrescar la copia a mano (`--desde-dane`) y subirla a R2.
URL_R2 = os.environ.get("MGN_URL", "https://pub-9d9d9ff84f4e49209f1c0cdfdaaaf366.r2.dev/ref/mgn_municipios_2018.geojson")
DESTINO = DATA / "raw" / "mgn_municipios_2018.geojson"


def desde_r2() -> int:
    r = requests.get(URL_R2, timeout=180)
    r.raise_for_status()
    n = len(r.json()["features"])
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_bytes(r.content)
    print(f"{n} polígonos desde R2, {len(r.content) / 1e6:.1f} MB -> {DESTINO}")
    return 0


def desde_dane() -> int:
    feats, offset = [], 0
    while True:
        r = requests.get(URL, params={"where": "1=1", "outFields": CAMPOS, "outSR": 4326, "f": "geojson",
                                      "maxAllowableOffset": 0.0005, "geometryPrecision": 5,
                                      "resultOffset": offset, "resultRecordCount": 200}, timeout=180)
        r.raise_for_status()
        page = r.json().get("features", [])
        feats += page
        if len(page) < 200:
            break
        offset += 200
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    print(f"{len(feats)} polígonos desde el DANE, {DESTINO.stat().st_size / 1e6:.1f} MB -> {DESTINO}")
    return 0


def main(argv: list[str]) -> int:
    return desde_dane() if "--desde-dane" in argv else desde_r2()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
