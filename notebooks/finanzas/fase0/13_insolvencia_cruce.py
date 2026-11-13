import json
import sys

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
df=pd.read_excel(sys.argv[1])
df.columns=[c.strip() for c in df.columns]
print(len(df),"filas;",df["NIT"].nunique(),"NIT únicos")
print("NIT no numéricos:", (~df["NIT"].astype(str).str.fullmatch(r"\d+")).sum())
print(df["PROCESO"].value_counts().to_string())
print(df["CATEGORIA"].value_counts().to_string())
f=pd.to_datetime(df["FECHA AUTO ADMISION"],errors="coerce")
print("fecha admisión nula:",f.isna().sum(),"rango",f.min(),f.max())
print(f.dt.year.value_counts().sort_index().to_string())
print("generación:",df["FECHA DE GENERACIÓN"].unique()[:3])
dup=df[df["NIT"].duplicated(keep=False)].sort_values("NIT")
print("NIT con >1 fila:",dup["NIT"].nunique()); print(dup[["NIT","PROCESO","FECHA AUTO ADMISION"]].head(8).to_string())
# unión
nits={int(k):set(v) for k,v in json.load(open(sys.argv[2])).items()}
df["nit"]=pd.to_numeric(df["NIT"],errors="coerce"); df["f"]=f
df["proc"]=df["PROCESO"].str.upper()
liq=df["proc"].str.contains("LIQUIDACI")
reo=df["proc"].str.contains("REORGANIZ")
print("liq",liq.sum(),"reorg",reo.sum(),"otros",(~liq&~reo).sum(), df.loc[~liq&~reo,"PROCESO"].value_counts().to_string())
allrep=set().union(*nits.values())
print("eventos cuyo NIT reporta en algún corte 2015-2025:", df["nit"].isin(allrep).sum(),"de",len(df), f"({df['nit'].isin(allrep).mean():.1%})")
print("\nAño t | empresas que reportan | eventos admitidos en (t+1..t+2) con NIT total | eventos de esas empresas que reportaron en t | tasa")
for t in range(2016,2024):
    ev=df[(df["f"]>=f"{t+1}-01-01")&(df["f"]<=f"{t+2}-12-31")]
    m=ev[ev["nit"].isin(nits[t])]
    print(t,len(nits[t]),len(ev),len(m),f"{len(m)/len(nits[t]):.2%}", "| de ellos reorg",m['proc'].str.contains('REORGANIZ').sum(),"liq",m['proc'].str.contains('LIQUIDACI').sum())
# ¿la empresa admitida seguía reportando después?
print("\nEventos 2020-2023 que reportaron el año antes de la admisión (t-1) por tipo de proceso:")
for y in range(2019,2025):
    ev=df[df["f"].dt.year==y]
    print(y,len(ev),"con estados del corte",y-1,":",ev["nit"].isin(nits[y-1]).sum(), f"({ev['nit'].isin(nits[y-1]).mean():.0%})")
