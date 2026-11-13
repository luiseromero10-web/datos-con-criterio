import sys; sys.stdout.reconfigure(encoding="utf-8")
import time

import requests

B="https://www.datos.gov.co"
def q(i, timeout=300, **params):
    p={("$"+k if not k.startswith("$") else k):v for k,v in params.items()}
    for t in range(3):
        try:
            r=requests.get(f"{B}/resource/{i}.json",params=p,timeout=timeout); r.raise_for_status(); return r.json()
        except requests.RequestException:
            if t==2: raise
            time.sleep(3)
def meta(i): return requests.get(f"{B}/api/views/{i}.json",timeout=60).json()
