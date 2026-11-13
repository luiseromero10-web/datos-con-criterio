"""Publica el gold de finanzas a R2 (prefijo `finanzas/gold/`). Solo debe correr después de validaciones.py con código 0.

Para no dejar nada a medias: primero todos los archivos se suben a `finanzas/staging/<corrida>/` y se comprueba su tamaño;
solo entonces se copian (en el servidor) a `finanzas/gold/` y por último se escribe `metadatos.json`. Si algo falla antes de
copiar, `gold/` queda intacto. `metadatos.json` lleva el tamaño y el sha256 de cada archivo, la fuente y su fecha de actualización.

Sin credenciales en el entorno corre en modo simulación y solo lista lo que subiría.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
from dotenv import load_dotenv

from pipelines.common import r2
from pipelines.finanzas import validaciones as val
from pipelines.finanzas.config import CONJUNTOS, DATA, GRANDES

load_dotenv()

PREFIJO = "finanzas"
from pipelines.finanzas.analisis import ARCHIVOS_FASE3

ARCHIVOS = ("estados.parquet", "empresas_anio.parquet", "empresas.parquet", *ARCHIVOS_FASE3, "alerta_agregada.parquet")
TIPOS = {".parquet": "application/vnd.apache.parquet", ".json": "application/json"}
CACHE = "public, max-age=300"
ATRIBUCION = ("Superintendencia de Sociedades (estados financieros NIIF reportados por las sociedades), datos.gov.co, "
              "licencia Creative Commons Attribution Share Alike 4.0 (CC BY-SA 4.0). Los datos derivados se comparten con la misma licencia.")
AVISO = "Información reportada por las sociedades a la Supersociedades. No es asesoría financiera ni calificación de riesgo."


def sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def construir_metadatos(data: Path = DATA, metricas: dict | None = None) -> dict:
    """Metadatos que acompañan al gold: versión, fuentes con su fecha de actualización, archivos y calidad."""
    gold = data / "gold"
    meta_bronze = json.loads((data / "bronze" / "_meta.json").read_text(encoding="utf-8")) if (data / "bronze" / "_meta.json").exists() else {}
    e = pd.read_parquet(gold / "estados.parquet", columns=["anio"])
    ids = {**CONJUNTOS, "grandes": GRANDES}
    return {
        "version": 1,
        "generado": datetime.now(UTC).isoformat(timespec="seconds"),
        "corrida": os.environ.get("GITHUB_RUN_ID", "local"),
        "commit": os.environ.get("GITHUB_SHA", "local"),
        "anios": sorted(int(a) for a in e["anio"].unique()),
        "filas": {a.removesuffix(".parquet"): pq.ParquetFile(gold / a).metadata.num_rows for a in ARCHIVOS if a.endswith(".parquet")},
        "fuentes": {c: {"id": i, "actualizado": meta_bronze.get(c)} for c, i in ids.items()},
        "archivos": {a: {"bytes": (gold / a).stat().st_size, "sha256": sha256(gold / a)} for a in ARCHIVOS},
        "calidad": metricas or {},
        "unidad": "pesos corrientes (la fuente informa miles de pesos)",
        "licencia": "CC BY-SA 4.0",
        "atribucion": ATRIBUCION,
        "aviso": AVISO,
    }


def publicar(s3, bucket: str, data: Path, meta: dict, corrida: str) -> list[str]:
    """Sube a staging, verifica, copia a gold y escribe metadatos al final. Devuelve las claves publicadas."""
    gold = data / "gold"
    staging = f"{PREFIJO}/staging/{corrida}"
    subidas: list[str] = []
    try:
        for nombre in ARCHIVOS:
            ruta = gold / nombre
            clave = f"{staging}/{nombre}"
            s3.upload_file(str(ruta), bucket, clave, ExtraArgs={"ContentType": TIPOS[ruta.suffix], "CacheControl": CACHE})
            subidas.append(clave)
            tam = s3.head_object(Bucket=bucket, Key=clave)["ContentLength"]
            if tam != ruta.stat().st_size:
                raise RuntimeError(f"{nombre}: en R2 pesa {tam} bytes y local {ruta.stat().st_size}; no se publica nada.")
    except Exception:
        _limpiar(s3, bucket, subidas)
        raise
    publicadas: list[str] = []
    for nombre in ARCHIVOS:  # la copia ocurre en el servidor: rápida, y gold no se toca si algo falló antes
        destino = f"{PREFIJO}/gold/{nombre}"
        s3.copy_object(Bucket=bucket, Key=destino, CopySource={"Bucket": bucket, "Key": f"{staging}/{nombre}"},
                       ContentType=TIPOS[Path(nombre).suffix], CacheControl=CACHE, MetadataDirective="REPLACE")
        publicadas.append(destino)
    clave_meta = f"{PREFIJO}/gold/metadatos.json"
    s3.put_object(Bucket=bucket, Key=clave_meta, Body=json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8"),
                  ContentType=TIPOS[".json"], CacheControl=CACHE)
    publicadas.append(clave_meta)
    _limpiar(s3, bucket, subidas)
    return publicadas


def _limpiar(s3, bucket: str, claves: list[str]) -> None:
    for k in claves:
        try:
            s3.delete_object(Bucket=bucket, Key=k)
        except Exception as e:  # noqa: BLE001 - limpiar es lo mejor que se puede; no debe tapar el error original
            print("no se pudo borrar", k, e)


def main(dry_run: bool = False) -> int:
    for nombre in ARCHIVOS:
        if not (DATA / "gold" / nombre).exists():
            print("Falta", nombre, "- ¿corrió transformar?")
            return 1
    _, _, metricas = val.validar(DATA)
    meta = construir_metadatos(DATA, metricas)
    faltan = r2.faltantes()
    if dry_run or faltan:
        print(f"SIMULACIÓN ({'--dry-run' if dry_run else 'faltan variables: ' + ', '.join(faltan)}). Se subirían a R2:")
        for nombre, info in meta["archivos"].items():
            print(f"  {PREFIJO}/gold/{nombre}  ({info['bytes'] / 1e6:.2f} MB)")
        print(f"  {PREFIJO}/gold/metadatos.json")
        print("Cortes:", meta["anios"], "| fuentes actualizadas:", {c: v["actualizado"] for c, v in meta["fuentes"].items()})
        return 0
    publicadas = publicar(r2.cliente(), os.environ["R2_BUCKET"], DATA, meta, str(meta["corrida"]))
    for k in publicadas:
        print("publicado", k)
    return 0


if __name__ == "__main__":
    sys.exit(main(dry_run="--dry-run" in sys.argv))
