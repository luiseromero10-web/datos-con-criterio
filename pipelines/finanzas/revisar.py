"""Revisión mensual: ¿cambió algún conjunto de la fuente desde la última publicación?

Compara `rowsUpdatedAt` de cada conjunto en datos.gov.co con el que quedó en `finanzas/gold/metadatos.json` (R2).
Escribe `reconstruir=true|false` y `motivo=...` en $GITHUB_OUTPUT. Una ejecución manual siempre reconstruye;
la programada solo si hay datos nuevos (o si todavía no hay nada publicado).
"""
from __future__ import annotations

import json
import os
import sys

from pipelines.common import r2
from pipelines.finanzas.config import CONJUNTOS, GRANDES
from pipelines.finanzas.ingesta import actualizado
from pipelines.finanzas.publicar import PREFIJO


def fuentes_actuales() -> dict[str, int]:
    return {c: actualizado(i) for c, i in {**CONJUNTOS, "grandes": GRANDES}.items()}


def fuentes_publicadas(s3=None, bucket: str | None = None) -> dict[str, int] | None:
    """Fechas de actualización guardadas en la última publicación; None si no hay publicación (o no se puede leer)."""
    if r2.faltantes():
        return None
    s3 = s3 or r2.cliente()
    bucket = bucket or os.environ["R2_BUCKET"]
    try:
        cuerpo = s3.get_object(Bucket=bucket, Key=f"{PREFIJO}/gold/metadatos.json")["Body"].read()
    except Exception:  # noqa: BLE001 - sin metadatos publicados (primera vez): hay que construir
        return None
    fuentes = json.loads(cuerpo).get("fuentes", {})
    return {c: v.get("actualizado") for c, v in fuentes.items()}


def decidir(actuales: dict[str, int], publicadas: dict[str, int] | None, manual: bool, forzar: bool = False) -> tuple[bool, str]:
    if forzar:
        return True, "reconstrucción forzada"
    if manual:
        return True, "ejecución manual"
    if publicadas is None:
        return True, "todavía no hay nada publicado"
    cambiaron = sorted(c for c, v in actuales.items() if publicadas.get(c) != v)
    if cambiaron:
        return True, "la fuente cambió: " + ", ".join(cambiaron)
    return False, "la fuente no cambió desde la última publicación"


def main() -> int:
    manual = os.environ.get("EVENTO", "") == "workflow_dispatch"
    forzar = os.environ.get("FORZAR_RECONSTRUCCION", "") in ("1", "true", "True")
    reconstruir, motivo = decidir(fuentes_actuales(), fuentes_publicadas(), manual, forzar)
    print(f"reconstruir={str(reconstruir).lower()} ({motivo})")
    salida = os.environ.get("GITHUB_OUTPUT")
    if salida:
        with open(salida, "a", encoding="utf-8") as f:
            f.write(f"reconstruir={str(reconstruir).lower()}\nmotivo={motivo}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
