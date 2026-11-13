import sys, collections, re
sys.path.insert(0, sys.argv[1])
from soc import q
rows=q("6hqw-m3dm",timeout=900,select="nit, valor",where="fecha_corte='2024-12-31' and id_punto_entrada in (412,421) and concepto like 'Clasificaci%CIIU%'",limit=60000)
c4=collections.Counter(); c2=collections.Counter()
for r in rows:
    m=re.match(r"[A-Z]?(\d{4})",r["valor"].strip())
    if m: c4[m.group(1)]+=1; c2[m.group(1)[:2]]+=1
print("informes individuales con CIIU:",sum(c4.values()),"de",len(rows))
print("CIIU-4 distintos:",len(c4)," CIIU-2 distintos:",len(c2))
for th in (15,30,45,60):
    ok4=[k for k,v in c4.items() if v>=th]
    print(f"CIIU-4 con >= {th} empresas: {len(ok4)} códigos, cubren {sum(c4[k] for k in ok4)/sum(c4.values()):.1%} de empresas")
ok2=[k for k,v in c2.items() if v>=45]
print(f"CIIU-2 con >=45: {len(ok2)}, cubren {sum(c2[k] for k in ok2)/sum(c2.values()):.1%}")
print("más grande CIIU-4:",c4.most_common(3))
