import json
import os
import sys

sys.path.insert(0, sys.argv[1])
from soc import q

# punto individual (G1, G2) por año
P={2015:(147,None),2016:(224,227),2017:(239,243),2018:(260,263),2019:(274,277),2020:(301,304),2021:(322,325),2022:(348,351),2023:(371,375),2024:(412,421),2025:(450,453)}
DS={sys.argv[3]:{"esf":"pfdp-zks5","eri":"prwj-nzxa","efe":"ctcp-462n"}[sys.argv[3]]}
outp=sys.argv[2]
res=json.load(open(outp,encoding="utf-8")) if os.path.exists(outp) else {}
for y,(g1,g2) in P.items():
    for g,pid in (("G1",g1),("G2",g2)):
        if pid is None: continue
        for k,d in DS.items():
            key=f"{y}|{g}|{k}"
            if key in res: continue
            r=q(d, timeout=900, select="concepto, count(distinct codigo_instancia) as informes", where=f"fecha_corte='{y}-12-31' and id_punto_entrada={pid}", group="concepto", order="informes desc", limit=2000)
            res[key]=[(x["concepto"],int(x["informes"])) for x in r]
            json.dump(res,open(outp,"w",encoding="utf-8"),ensure_ascii=False)
            print(key,len(r),flush=True)
