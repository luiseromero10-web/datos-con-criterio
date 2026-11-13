import json
import re
import sys
import unicodedata

sys.stdout.reconfigure(encoding="utf-8")
def norm(s):
    s=s.replace("\ufffd","")
    s=unicodedata.normalize("NFKD",s); s="".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+"," ",s.lower()).strip()
def pn(p):  # patrón: quitar vocales acentuadas/ñ porque en la fuente salen como «�» (se pierden)
    return re.sub("[áéíóúüñ]","",p.lower())
R={}
for f in ("esf","eri","efe"):
    R.update(json.load(open(f"{sys.argv[1]}/rubros_{f}.json",encoding="utf-8")))
V=[
 ("esf","activo_total",[r"total de activos",r"activos"]),
 ("esf","activo_corriente",[r"activos corrientes totales",r"activos corrientes"]),
 ("esf","efectivo",[r"efectivo y equivalentes al efectivo"]),
 ("esf","cxc_comerciales_corr",[r"cuentas comerciales por cobrar y otras cuentas por cobrar corrientes"]),
 ("esf","inventarios_corr",[r"inventarios corrientes"]),
 ("esf","ppe",[r"propiedades, planta y equipo"]),
 ("esf","pasivo_total",[r"total pasivos",r"pasivos"]),
 ("esf","pasivo_corriente",[r"pasivos corrientes totales",r"pasivos corrientes"]),
 ("esf","oblig_fin: otros pasivos financieros corr.",[r"otros pasivos financieros corrientes"]),
 ("esf","oblig_fin: otros pasivos financieros no corr.",[r"otros pasivos financieros no corrientes"]),
 ("esf","oblig_fin: préstamos corrientes",[r"préstamos corrientes"]),
 ("esf","oblig_fin: parte corriente de préstamos no corr.",[r"parte corriente de préstamos no corrientes"]),
 ("esf","oblig_fin: parte no corriente de préstamos",[r"parte no corriente de préstamos no corrientes"]),
 ("esf","cxp_comerciales",[r"cuentas por pagar comerciales y otras cuentas por pagar corrientes",r"cuentas por pagar comerciales y otras cuentas por pagar"]),
 ("esf","patrimonio",[r"patrimonio total",r"patrimonio"]),
 ("esf","ganancias_acumuladas",[r"ganancias acumuladas"]),
 ("eri","ingresos",[r"ingresos de actividades ordinarias"]),
 ("eri","costo_ventas",[r"costo de ventas"]),
 ("eri","ganancia_bruta",[r"ganancia bruta"]),
 ("eri","gastos_admin",[r"gastos de administración"]),
 ("eri","gastos_ventas (G2) / costos_distribución (G1)",[r"gastos de ventas",r"costos de distribución"]),
 ("eri","ganancia_operacional",[r"ganancia \(pérdida\) por actividades de operación"]),
 ("eri","costos_financieros",[r"costos financieros"]),
 ("eri","ingresos_financieros",[r"ingresos financieros"]),
 ("eri","ganancia_antes_imp",[r"ganancia \(pérdida\), antes de impuestos"]),
 ("eri","impuesto",[r"ingreso \(gasto\) por impuestos",r"gasto \(ingreso\) por impuestos, operaciones continuadas"]),
 ("eri","ganancia_neta",[r"ganancia \(pérdida\)"]),
 ("efe","flujo_operación",[r"flujos de efectivo netos procedentes de \(utilizados en\) actividades de operación",r"flujos de efectivo procedentes de \(utilizados en\) actividades de operación"]),
 ("efe","flujo_inversión",[r"flujos de efectivo netos procedentes de \(utilizados en\) actividades de inversión",r"flujos de efectivo procedentes de \(utilizados en\) actividades de inversión"]),
 ("efe","flujo_financiación",[r"flujos de efectivo netos procedentes de \(utilizados en\) actividades de financiación",r"flujos de efectivo procedentes de \(utilizados en\) actividades de financiación"]),
 ("efe","depreciación_amortización",[r"\( \+ \) ajustes por gastos de depreciación y amortización",r"\(\+\) ajustes por gastos de depreciación y amortización",r"ajustes por gastos de depreciación y amortización"]),
 ("efe","efectivo_final",[r"efectivo y equivalentes al efectivo al final del periodo"]),
]
years=list(range(2015,2026))
def inf(y,g):
    return max(n for _,n in R[f"{y}|{g}|esf"])
def cov(y,g,ds,pats):
    k=f"{y}|{g}|{ds}"
    if k not in R or not R[k]: return None,{}
    h={}
    for c,n in R[k]:
        nc=norm(c)
        for p in pats:
            if re.fullmatch(pn(p),nc): h[c]=n
    return h
out=[]
w=out.append
w("# Matriz de rubros: cobertura por año y grupo NIIF\n")
w("Cobertura = % de los informes **individuales** del grupo y año que traen el rubro (conteo de `codigo_instancia` distintos por rubro, filtrando `fecha_corte` = 31-dic del año y el punto de entrada individual). Un rubro ausente suele significar valor cero no reportado, no dato faltante: se ratificará en la Fase 1.\n")
w("Puntos de entrada usados: G1 = «10 NIIF Plenas – Individual(es) Grupo 1»; G2 = «40 NIIF Pymes – Individual(es) Grupo 2». 2015 solo tiene Grupo 1 y no trae flujo de efectivo.\n")
for g in ("G1","G2"):
    ys=[y for y in years if f"{y}|{g}|esf" in R]
    w(f"\n## {'Grupo 1 (NIIF plenas)' if g=='G1' else 'Grupo 2 (NIIF pymes)'}\n")
    w("| Informes | "+" | ".join(str(inf(y,g)) for y in ys)+" |")
    w("| Variable | "+" | ".join(str(y) for y in ys)+" |")
    w("|---|"+"---|"*len(ys))
    for ds,var,pats in V:
        cells=[]
        for y in ys:
            h=cov(y,g,ds,pats)
            h=h[1] if isinstance(h,tuple) else h
            if f"{y}|{g}|{ds}" not in R or not R[f"{y}|{g}|{ds}"]: cells.append("–"); continue
            # cobertura = máx entre alias (no sumar: un informe tiene un solo alias)
            tot=inf(y,g)
            cells.append(f"{min(100,round(100*max(h.values(),default=0)/tot))}")
        w(f"| {var} | "+" | ".join(cells)+" |")
w("\n## Alias de rótulos por variable (taxonomías distintas según el año)\n")
for ds,var,pats in V:
    alias={}
    for g in ("G1","G2"):
        for y in years:
            h=cov(y,g,ds,pats)
            h=h[1] if isinstance(h,tuple) else h
            for c,n in (h or {}).items(): alias.setdefault(c,set()).add(y)
    if alias:
        w(f"- **{var}**: "+"; ".join(f"«{c.replace(chr(0xfffd),'?')}» ({min(ys)}–{max(ys)}{'' if len(ys)==max(ys)-min(ys)+1 else ', con huecos'})" for c,ys in alias.items()))
open(sys.argv[2],"w",encoding="utf-8").write("\n".join(out)+"\n")
print("\n".join(out))
