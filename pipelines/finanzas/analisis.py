"""gold de la Fase 3: indicadores, pares y percentiles, señales y vista de sector. Lee gold/estados y gold/empresas_anio.

Escribe en gold (se publican a R2):
  indicadores.parquet   una fila por sociedad y año: 16 indicadores, su motivo si quedaron vacíos y valores en pesos constantes
  pares.parquet         grupo de pares y percentiles (`pct_<indicador>`, 0–100)
  senales.parquet       7 señales objetivas (verdadero, falso o nulo si no se puede evaluar)
  sector_anio.parquet   cuantiles de cada indicador por sector (clase CIIU, división y sección) y año
  sector_resumen.parquet  tamaño, ingresos, crecimiento real, % con pérdida, % con patrimonio negativo y % que crece rentable
  ciiu.parquet          catálogo CIIU Rev. 4 A.C.
  catalogos.json        definiciones de indicadores y señales, motivos, IPC y año base de los pesos constantes
Escribe en silver: altman.parquet (Z'' de Altman: línea base del modelo; NO se publica porque es un puntaje individual de riesgo).
Los archivos van ordenados por NIT y año, en grupos de filas pequeños, para que el sitio lea una ficha con pocas peticiones de rango.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from pipelines.finanzas import catalogos, indicadores, pares, senales
from pipelines.finanzas.config import DATA

GRUPO_FILAS = 20_000
ARCHIVOS_FASE3 = ("indicadores.parquet", "pares.parquet", "senales.parquet", "sector_anio.parquet", "sector_resumen.parquet",
                  "ciiu.parquet", "catalogos.json")


def escribir(df: pd.DataFrame, ruta: Path) -> None:
    df.to_parquet(ruta, index=False, compression="zstd", row_group_size=GRUPO_FILAS)


def catalogo_json(anios: list[int]) -> dict:
    ipc = catalogos.ipc()
    ipc = ipc[ipc["anio"].isin(range(min(anios) - 1, max(anios) + 1))].assign(variacion_diciembre=lambda t: t["ipc_dic"].pct_change())
    return {
        "indicadores": [{"id": i.id, "nombre": i.nombre, "unidad": i.unidad, "formula": i.formula, "sentido": i.sentido, "nota": i.nota}
                        for i in indicadores.INDICADORES],
        "motivos": indicadores.MOTIVOS,
        "senales": [{"id": s.id, "texto": s.texto} for s in senales.SENALES],
        "pares": {"minimo_por_tercil": pares.MIN_TERCIL, "minimo_para_terciles": pares.MIN_GRUPO, "minimo_para_percentil": pares.MIN_PARES,
                  "niveles": {"ciiu4_tercil": "Misma clase CIIU (4 dígitos) y mismo tercil de ingresos",
                              "ciiu2_tercil": "Misma división CIIU (2 dígitos) y mismo tercil de ingresos",
                              "ciiu2": "Misma división CIIU (2 dígitos)", "ninguno": "Sin pares suficientes"}},
        "pesos_constantes": {"anio_base": max(anios), "flujos": "IPC promedio anual", "saldos": "IPC de diciembre",
                             "fuente": "DANE, IPC total nacional, serie de empalme (base dic. 2018 = 100)",
                             "ipc": ipc[["anio", "ipc_dic", "ipc_prom", "variacion_diciembre"]].round(6).to_dict("records")},
    }


def main(data: Path = DATA) -> None:
    gold, silver = data / "gold", data / "silver"
    e = pd.read_parquet(gold / "estados.parquet")
    ea = pd.read_parquet(gold / "empresas_anio.parquet")
    ind, alt = indicadores.calcular(e)

    base = e[["nit", "anio", "ingresos", "activo_total"]].merge(ea[["nit", "anio", "ciiu_codigo"]], on=["nit", "anio"], how="left")
    b = pares.asignar(base)
    b = pd.concat([b, pares.grupo_de_pares(b)], axis=1)
    pct = pares.percentiles(ind, b)
    pares_df = b[["nit", "anio", "grupo_pares", "nivel_pares", "codigo_pares", "tercil", "n_pares"]].merge(pct, on=["nit", "anio"])
    sen = senales.calcular(e, ind, ea)
    sector, resumen = pares.vista_sector(ind, b, sen, e)

    gold.mkdir(parents=True, exist_ok=True)
    ordenar = ["nit", "anio"]
    escribir(ind.sort_values(ordenar), gold / "indicadores.parquet")
    escribir(pares_df.sort_values(ordenar), gold / "pares.parquet")
    escribir(sen.sort_values(ordenar), gold / "senales.parquet")
    escribir(sector.sort_values(["nivel", "codigo", "anio", "indicador"]), gold / "sector_anio.parquet")
    escribir(resumen.sort_values(["nivel", "codigo", "anio"]), gold / "sector_resumen.parquet")
    escribir(catalogos.ciiu(), gold / "ciiu.parquet")
    (gold / "catalogos.json").write_text(json.dumps(catalogo_json(sorted(int(a) for a in e["anio"].unique())), ensure_ascii=False, indent=1), encoding="utf-8")
    escribir(alt.sort_values(ordenar), silver / "altman.parquet")
    print(f"indicadores {len(ind):,} filas · pares {len(pares_df):,} · sector {len(sector):,} filas ({resumen['nivel'].value_counts().to_dict()})")


if __name__ == "__main__":
    main()
