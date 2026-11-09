"""Cliente S3 para Cloudflare R2. Las credenciales salen SOLO de variables de entorno."""
from __future__ import annotations

import os

import boto3

VARIABLES = ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET")


def faltantes() -> list[str]:
    return [v for v in VARIABLES if not os.environ.get(v)]


def cliente():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
