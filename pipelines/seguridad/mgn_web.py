"""Genera site/public/data/municipios.geojson: polígonos simplificados (~250 m) con solo el código DIVIPOLA, para el mapa web.

El MGN completo pesa 8,6 MB; el mapa solo necesita la silueta. Se conserva la topología (los vecinos siguen compartiendo borde).
"""
from __future__ import annotations

import json
import sys

from shapely.geometry import mapping, shape

from pipelines.seguridad.config import DATA

TOLERANCIA = 0.0025  # grados (~275 m)
DECIMALES = 4


def _redondear(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], DECIMALES), round(coords[1], DECIMALES)]
    return [_redondear(c) for c in coords]


def main() -> int:
    g = json.loads((DATA / "raw" / "mgn_municipios_2018.geojson").read_text(encoding="utf-8"))
    feats = []
    for f in g["features"]:
        geom = shape(f["geometry"]).buffer(0).simplify(TOLERANCIA, preserve_topology=True)
        if geom.is_empty:
            continue
        m = mapping(geom)
        feats.append({"type": "Feature", "properties": {"c": f["properties"]["MPIO_CDPMP"]},
                      "geometry": {"type": m["type"], "coordinates": _redondear(m["coordinates"])}})
    destino = DATA.parent / "site" / "public" / "data" / "municipios.geojson"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf-8")
    print(f"{len(feats)} municipios, {destino.stat().st_size / 1e6:.2f} MB -> {destino}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
