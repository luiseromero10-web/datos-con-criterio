import json
import sys

sys.path.insert(0, sys.argv[1])
from soc import meta, q

m=meta("6cat-2gcs")
for c in m["columns"]:
    print(c["fieldName"], "|", (c.get("description") or "")[:200])
print("DESC:", (m.get("description") or "")[:800])
for nit in (860005224, 860025900, 890903939):
    print("==",nit)
    for d,filtro in (("pfdp-zks5","lower(concepto) like '%total de activos%' or lower(concepto) like 'activos totales%' or lower(concepto) like 'patrimonio total%' or lower(concepto) like 'pasivos totales%'"),("prwj-nzxa","lower(concepto) like 'ingresos de actividades ordinarias%' or lower(concepto) like '%ganancia (p%rdida)'")):
        r=q(d, select="id_punto_entrada, codigo_instancia, concepto, periodo, valor", where=f"nit={nit} and fecha_corte='2024-12-31' and ({filtro})", limit=40)
        for x in r: print(d, json.dumps(x,ensure_ascii=False))
