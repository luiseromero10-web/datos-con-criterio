"""Publica gold a R2 (prefijo gold/) y guarda una instantÃ¡nea semanal para estimar el registro tardÃ­o.

Sin credenciales en el entorno corre en modo simulaciÃ³n (--dry-run implÃ­cito) y solo lista lo que subirÃ­a.
Solo debe ejecutarse despuÃ©s de que validaciones.py haya salido con cÃ³digo 0.
"""
from __future__ import annotations

import json
import sys
from datetime import UTC, date, datetime

import duckdb
from dotenv import load_dotenv

from pipelines.common import r2
from pipelines.seguridad.config import DATA

load_dotenv()

TIPOS = {".parquet": "application/vnd.apache.parquet", ".json": "application/json"}


def escribir_metadatos() -> dict:
    """Fusiona con el metadatos.json existente (predecir.py ya guardÃ³ versiÃ³n y mÃ©todo del modelo) en lugar de reescribirlo."""
    con = duckdb.connect()
    corte = con.execute(f"select max(fecha) from '{(DATA / 'silver' / 'hechos.parquet').as_posix()}'").fetchone()[0]
    ruta = DATA / "gold" / "metadatos.json"
    meta = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}
    meta.update({"fecha_corte": str(corte), "actualizado": datetime.now(UTC).isoformat(timespec="seconds"),
                 "semanas_provisionales": 8})
    meta.setdefault("version_modelo", None)
    ruta.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def instantanea() -> str:
    """Totales por delito y semana tal como llegaron hoy (insumo para medir cuÃ¡nto se corrige cada semana)."""
    hoy = date.today().isoformat()
    destino = DATA / "snapshots" / f"semanal_{hoy}.parquet"
    destino.parent.mkdir(parents=True, exist_ok=True)
    duckdb.connect().execute(f"""COPY (select '{hoy}' as fecha_carga, delito, periodo, sum(conteo) as n
        from '{(DATA / 'gold' / 'hechos_semana_mpio.parquet').as_posix()}' group by 2, 3)
        TO '{destino.as_posix()}' (FORMAT PARQUET)""")
    return destino.name


def main(dry_run: bool = False, solo_modelos: bool = False) -> int:
    if solo_modelos:  # entrenamiento mensual: solo la selecciÃ³n y las mÃ©tricas; el gold lo publica la ingesta tras validarlo
        archivos = [(DATA / "modelos" / n, f"models/{n}") for n in ("seleccion.json", "metrics.json") if (DATA / "modelos" / n).exists()]
        meta = {"fecha_corte": "n/d"}
    else:
        meta = escribir_metadatos()
        snap = instantanea()
        archivos = [(p, f"gold/{p.name}") for p in sorted((DATA / "gold").iterdir()) if p.suffix in TIPOS]
        archivos.append((DATA / "snapshots" / snap, f"snapshots/{snap}"))
    sin_creds = r2.faltantes()
    if dry_run or sin_creds:
        motivo = "--dry-run" if dry_run else f"faltan variables: {', '.join(sin_creds)}"
        print(f"SIMULACIÃ“N ({motivo}). Se subirÃ­an a R2:")
        for p, clave in archivos:
            print(f"  {clave}  ({p.stat().st_size / 1e6:.2f} MB)")
        print("Corte de datos:", meta["fecha_corte"])
        return 0
    import os
    s3, bucket = r2.cliente(), os.environ["R2_BUCKET"]
    for p, clave in archivos:
        s3.upload_file(str(p), bucket, clave, ExtraArgs={
            "ContentType": TIPOS[p.suffix], "CacheControl": "public, max-age=300"})
        print("subido", clave)
    return 0


if __name__ == "__main__":
    sys.exit(main(dry_run="--dry-run" in sys.argv, solo_modelos="--modelos" in sys.argv))
