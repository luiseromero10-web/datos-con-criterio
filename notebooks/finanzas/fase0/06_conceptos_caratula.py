import json
import sys

sys.path.insert(0, sys.argv[1])
from soc import q

res={}
for y,pid in ((2016,227),(2018,263),(2019,277),(2020,304),(2021,325),(2022,351),(2023,375)):
    r=q("6hqw-m3dm", timeout=900, select="concepto, count(*) as n", where=f"fecha_corte='{y}-12-31' and id_punto_entrada={pid}", group="concepto", order="n desc", limit=100)
    res[y]={x["concepto"]:int(x["n"]) for x in r}
    print(y,len(r),flush=True)
base=res[2023]
for y in res:
    print("== ",y,"conceptos con 'ciiu|actividad|econ|sector|objeto|ciudad|depart':",[ (c[:50],n) for c,n in res[y].items() if any(k in c.lower() for k in ("ciiu","actividad","econ","sector","objeto","ciudad","departamento"))])
json.dump(res,open(sys.argv[2],"w",encoding="utf-8"),ensure_ascii=False)
