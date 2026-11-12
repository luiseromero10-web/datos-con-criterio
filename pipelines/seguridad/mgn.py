"""Descarga los polígonos municipales del MGN 2018 (DANE) a data/raw/mgn_municipios_2018.geojson.

Fuente: https://portalgis.dane.gov.co/mparcgis/rest/services/MGN2018/Serv_CapaMunicipiosInt_2018/MapServer/0
(enlazada desde datos.gov.co, conjunto dnxb-k5pj). Se piden solo los campos necesarios, en WGS84 y con simplificación
en el servidor (~55 m) para que el archivo sea manejable; basta para contigüidad y para el mapa.
"""
from __future__ import annotations

import json
import sys

import requests

from pipelines.seguridad.config import DATA

URL = "https://portalgis.dane.gov.co/mparcgis/rest/services/MGN2018/Serv_CapaMunicipiosInt_2018/MapServer/0/query"
CAMPOS = "MPIO_CDPMP,MPIO_CNMBR,DPTO_CCDGO,AREA"


def main() -> int:
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
    destino = DATA / "raw" / "mgn_municipios_2018.geojson"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    print(f"{len(feats)} polígonos, {destino.stat().st_size / 1e6:.1f} MB -> {destino}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
