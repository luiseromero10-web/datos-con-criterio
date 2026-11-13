import json
import sys

sys.path.insert(0, sys.argv[1])
from soc import q

out=[]
for y in range(2015,2026):
    f=f"{y}-12-31"
    r=q("6hqw-m3dm", timeout=600, select="id_punto_entrada, punto_entrada, id_taxonomia, taxonomia, count(distinct codigo_instancia) as informes", where=f"fecha_corte='{f}' and concepto='NIT'", group="id_punto_entrada, punto_entrada, id_taxonomia, taxonomia", order="informes desc", limit=30)
    for x in r:
        x["anio"]=y; out.append(x)
        print(y, x["id_punto_entrada"], x["punto_entrada"], x["id_taxonomia"], x["taxonomia"], x["informes"], flush=True)
json.dump(out, open(sys.argv[2],"w",encoding="utf-8"), ensure_ascii=False)
