import json
import sys

sys.path.insert(0, sys.argv[1])
from soc import q

out={}
for y in range(2015,2026):
    rows=q("6hqw-m3dm", timeout=900, select="distinct nit", where=f"fecha_corte='{y}-12-31' and concepto='NIT'", limit=60000)
    out[y]=sorted({int(float(r["nit"])) for r in rows})
    print(y,len(out[y]),flush=True)
json.dump(out,open(sys.argv[2],"w"))
