"""Descarga de R2 la selección de modelo vigente (models/seleccion.json y models/metrics.json); si no existe, se usa la del repo."""
from __future__ import annotations

import os

from botocore.exceptions import ClientError
from dotenv import load_dotenv

from pipelines.common import r2
from pipelines.seguridad.config import DATA

load_dotenv()
ARCHIVOS = ("seleccion.json", "metrics.json")


def main() -> int:
    if r2.faltantes():
        print("Sin credenciales de R2; se usa el modelo versionado en el repo.")
        return 0
    s3, bucket = r2.cliente(), os.environ["R2_BUCKET"]
    (DATA / "modelos").mkdir(parents=True, exist_ok=True)
    for nombre in ARCHIVOS:
        try:
            s3.download_file(bucket, f"models/{nombre}", str(DATA / "modelos" / nombre))
            print("descargado models/" + nombre)
        except ClientError as e:
            print(f"models/{nombre} no está en R2 ({e.response['Error']['Code']}); se usa el del repo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
