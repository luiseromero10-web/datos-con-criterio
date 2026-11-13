import sys

sys.path.insert(0, sys.argv[1])
from soc import q

rows=q("6cat-2gcs",timeout=900,select="nit, supervisor, total_activos, ingresos_operacionales",where="a_o_de_corte=2024 and supervisor='SUPERSOCIEDADES'",limit=20000)
def v(s):
    s=(s or "").replace("$","").replace(",","").strip()
    neg=s.startswith("-"); s=s.lstrip("-")
    try: x=float(s)
    except: return None
    return -x if neg else x
A=[v(r["total_activos"]) for r in rows]; I=[v(r["ingresos_operacionales"]) for r in rows]
print("filas",len(rows),"activos nulos",sum(a is None for a in A),"ingresos nulos",sum(i is None for i in I))
for th in (0.05,0.1,0.25,0.5,1):
    print(f"activos >= {th} billones:",sum(1 for a in A if a is not None and a>=th), "| error máx de redondeo %.1f%%"%(0.5*0.01/th*100))
print("muestra",rows[:3])
