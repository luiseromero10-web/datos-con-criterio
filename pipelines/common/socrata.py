"""Cliente mínimo de Socrata (datos.gov.co) con paginación y reintentos."""
from __future__ import annotations

import os
import time

import requests

BASE = "https://www.datos.gov.co/resource"


def fetch_all(dataset_id: str, where: str | None = None, page_size: int = 50000,
              max_retries: int = 5) -> list[dict]:
    """Descarga todas las filas de un conjunto (opcionalmente filtradas) paginando por $offset."""
    headers = {}
    token = os.environ.get("SOCRATA_APP_TOKEN")
    if token:
        headers["X-App-Token"] = token
    rows: list[dict] = []
    offset = 0
    while True:
        params = {"$limit": page_size, "$offset": offset, "$order": ":id"}
        if where:
            params["$where"] = where
        for intento in range(max_retries):
            try:
                r = requests.get(f"{BASE}/{dataset_id}.json", params=params, headers=headers, timeout=120)
                r.raise_for_status()
                break
            except requests.RequestException:
                if intento == max_retries - 1:
                    raise
                time.sleep(2 ** intento)
        page = r.json()
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size
