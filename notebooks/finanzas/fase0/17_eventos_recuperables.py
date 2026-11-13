"""Eventos que se recuperan uniendo cortes antiguos: procesos que ya no están en la base actual y cuya empresa
había presentado estados el año anterior a su año de apertura. Uso: <actual.xlsx> <antiguo.xlsx> <nits_por_anio.json>."""
import json
import sys

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")


def cargar(ruta):
    df = pd.read_excel(ruta)
    df.columns = [str(c).strip().upper() for c in df.columns]
    df["nit"] = pd.to_numeric(df["NIT"], errors="coerce")
    col_a = next(c for c in df.columns if c.startswith("AÑO_DE_APERTURA"))
    df["apertura"] = pd.to_numeric(df[col_a], errors="coerce")
    return df


with open(sys.argv[3], encoding="utf-8") as fh:
    nits = {int(k): set(v) for k, v in json.load(fh).items()}
actual = cargar(sys.argv[1])
nits_actual = set(actual["nit"].dropna())
v = cargar(sys.argv[2])
perdidos = v[~v["nit"].isin(nits_actual)]
con_estados = perdidos[[int(n) in nits.get(int(a) - 1, set()) for n, a in zip(perdidos["nit"], perdidos["apertura"], strict=True)]]
print(f"{sys.argv[2].split('/')[-1]}: procesos que ya no están en la base actual: {len(perdidos)}")
print("   de ellos, con estados presentados el año previo a la apertura:", len(con_estados), "por apertura:", con_estados["apertura"].value_counts().sort_index().to_dict())
