import json
import sys

sys.path.insert(0, sys.argv[1])
from soc import q

nits={int(k):set(v) for k,v in json.load(open(sys.argv[2])).items()}
print("== periodo: valores distintos del ESF por año (individual G2)")
P={2016:227,2017:243,2018:263,2019:277}
for y,pid in P.items():
    r=q("pfdp-zks5",timeout=900,select="periodo, count(*) as n",where=f"fecha_corte='{y}-12-31' and id_punto_entrada={pid}",group="periodo",order="n desc",limit=6)
    print(y,[(x["periodo"],x["n"]) for x in r],flush=True)
print("== filas ESF y ERI por año vs informes (promedio de filas por informe)")
for y in (2021,2022,2023):
    for d,name in (("pfdp-zks5","esf"),("prwj-nzxa","eri")):
        r=q(d,timeout=900,select="count(*) as n, count(distinct codigo_instancia) as inf",where=f"fecha_corte='{y}-12-31' and periodo='Periodo Actual'")
        n,i=int(r[0]["n"]),int(r[0]["inf"]); print(y,name,"filas periodo actual",n,"informes",i,f"filas/informe {n/i:.1f}",flush=True)
print("== 6cat-2gcs 2024 por supervisor y cruce con NIT que reportan")
r=q("6cat-2gcs",timeout=900,select="supervisor, count(*) as n",where="a_o_de_corte=2024",group="supervisor",order="n desc",limit=20)
print([(x["supervisor"],x["n"]) for x in r])
rows=q("6cat-2gcs",timeout=900,select="nit, supervisor",where="a_o_de_corte=2024",limit=20000)
T=nits[2024]
tot=len(rows); inn=sum(1 for x in rows if int(float(x["nit"])) in T)
print("10 000 mayores 2024:",tot,"con estados en Supersociedades 2024:",inn)
import collections

c=collections.Counter(); d=collections.Counter()
for x in rows:
    c[x["supervisor"]]+=1; d[x["supervisor"]]+= int(float(x["nit"])) in T
print({k:(c[k],d[k]) for k in c})
for y in (2021,2022,2023,2025):
    rr=q("6cat-2gcs",timeout=900,select="count(*) as n",where=f"a_o_de_corte={y}"); print(y,rr)
