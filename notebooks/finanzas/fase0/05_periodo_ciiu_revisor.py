import sys

sys.path.insert(0, sys.argv[1])
from soc import q

for y,pid in ((2016,227),(2019,277),(2024,421)):
    print("== periodo ESF",y, [ (x["periodo"],x["n"]) for x in q("pfdp-zks5", timeout=900, select="periodo, count(*) as n", where=f"fecha_corte='{y}-12-31' and id_punto_entrada={pid}", group="periodo", limit=10)], flush=True)
    for conc in ("%CIIU%","Concepto del Revisor fiscal%","Fecha de constituci%","Estos estados financieros presentan informaci%"):
        r=q("6hqw-m3dm", timeout=900, select="concepto, valor, count(*) as n", where=f"fecha_corte='{y}-12-31' and id_punto_entrada={pid} and concepto like '{conc}'", group="concepto, valor", order="n desc", limit=6)
        print("  ",conc,[(x["concepto"][:40],x["valor"][:60],x["n"]) for x in r], flush=True)
