"""¿La base de insolvencia es una foto de procesos vigentes? Compara cortes antiguos con el actual (por NIT)."""
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


actual = cargar(sys.argv[1])
nits_actual = set(actual["nit"].dropna())
print(f"actual (nov-2026): {len(actual)} filas")
for ruta, etiqueta in ((sys.argv[2], "dic-2019"), (sys.argv[3], "dic-2022")):
    v = cargar(ruta)
    print(f"== {etiqueta}: hoja única «Procesos en Curso», {len(v)} filas, columnas: {list(v.columns)}")
    sigue = v["nit"].isin(nits_actual)
    print(f"   NIT que siguen en la base de nov-2026: {sigue.sum()} de {len(v)} ({sigue.mean():.0%}); desaparecen: {(~sigue).sum()} ({(~sigue).mean():.0%})")
    print("   apertura de los que desaparecen:", v.loc[~sigue, "apertura"].value_counts().sort_index().to_dict())
    print("   proceso de los que desaparecen:", v.loc[~sigue, "PROCESO"].astype(str).str.upper().str.slice(0, 20).value_counts().head(5).to_dict())
    pn = v["NOMBRE"].astype(str).str.contains(r"P\.?N\.?C", regex=True).sum()
    print(f"   filas de personas naturales comerciantes (P.N.C.): {pn}")
pn_act = actual["NOMBRE"].astype(str).str.contains(r"P\.?N\.?C", regex=True).sum()
print(f"actual: filas de personas naturales (P.N.C.): {pn_act}")
