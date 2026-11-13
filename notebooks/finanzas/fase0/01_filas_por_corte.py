import json
import sys

sys.path.insert(0, sys.argv[1])
from soc import q

# informes (codigo_instancia) y NIT distintos por fecha_corte, solo conceptos de identidad para aligerar
r = q("6hqw-m3dm", timeout=600, select="fecha_corte, count(*) as filas", group="fecha_corte", order="fecha_corte", limit=500)
for x in r: print(json.dumps(x), flush=True)
