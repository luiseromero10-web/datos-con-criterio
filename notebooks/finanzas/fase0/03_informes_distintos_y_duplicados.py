import json
import sys

sys.path.insert(0, sys.argv[1])
from soc import q

print("== balance, instancia 361459 (NIT 800000090, 2022): filas por (concepto,periodo) con repeticiones")
r=q("pfdp-zks5", select="concepto, periodo, count(*) as n, count(distinct valor) as vals", where="codigo_instancia=361459", group="concepto, periodo", order="n desc", limit=8)
for x in r: print(json.dumps(x,ensure_ascii=False))
print("== informes DISTINTOS por corte 31-dic (carátula, concepto NIT)")
for y in range(2015,2026):
    f=f"{y}-12-31"
    r=q("6hqw-m3dm", timeout=600, select="count(*) as filas_nit, count(distinct codigo_instancia) as informes, count(distinct nit) as nits", where=f"fecha_corte='{f}' and concepto='NIT'")
    print(y, json.dumps(r[0]), flush=True)
