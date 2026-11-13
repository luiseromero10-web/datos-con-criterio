import json
import sys

sys.path.insert(0, sys.argv[1])
from soc import q

D="6hqw-m3dm"
for y in (2021,2022,2023):
    f=f"{y}-12-31"
    print("==",f, flush=True)
    for x in q(D, timeout=600, select="id_punto_entrada, count(*) as informes, count(distinct nit) as nits, count(distinct numero_radicado) as radicados", where=f"fecha_corte='{f}' and concepto='NIT'", group="id_punto_entrada", order="informes desc", limit=20): print(json.dumps(x, ensure_ascii=False), flush=True)
    for conc in ("Tipo societario","Estado actual","La sociedad es"):
        print("  --",conc, flush=True)
        for x in q(D, timeout=600, select="valor, count(*) as n", where=f"fecha_corte='{f}' and concepto='{conc}' and id_punto_entrada in (351,40,421)" if False else f"fecha_corte='{f}' and concepto='{conc}'", group="valor", order="n desc", limit=8): print("   ",json.dumps(x, ensure_ascii=False), flush=True)
