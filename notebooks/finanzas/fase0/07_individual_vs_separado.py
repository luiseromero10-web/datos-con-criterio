import json
import sys

sys.path.insert(0, sys.argv[1])
from soc import q

P={2016:(224,227,225,228),2017:(239,243,241,244),2018:(260,263,261,264),2019:(274,277,275,278),2020:(301,304,302,305),2021:(322,325,323,326),2022:(348,351,349,352),2023:(371,375,372,376),2024:(412,421,413,422),2025:(450,453,451,455)}
nits=json.load(open(sys.argv[2]))
print("año | NIT totales | con individual | solo separado (sin individual) | sin individual ni separado | informes individuales/NIT>1")
for y,(i1,i2,s1,s2) in P.items():
    ind=q("6hqw-m3dm",timeout=900,select="nit, count(distinct codigo_instancia) as k",where=f"fecha_corte='{y}-12-31' and concepto='NIT' and id_punto_entrada in ({i1},{i2})",group="nit",limit=60000)
    sep=q("6hqw-m3dm",timeout=900,select="distinct nit",where=f"fecha_corte='{y}-12-31' and concepto='NIT' and id_punto_entrada in ({s1},{s2})",limit=60000)
    I={int(float(r['nit'])) for r in ind}; Sx={int(float(r['nit'])) for r in sep}
    T=set(nits[str(y)])
    multi=sum(1 for r in ind if int(r['k'])>1)
    print(y,len(T),len(I),len(Sx-I),len(T-I-Sx),multi,flush=True)
