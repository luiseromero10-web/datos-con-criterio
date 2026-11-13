import json

import pandas as pd
import pytest

from pipelines.finanzas import publicar as pub
from pipelines.finanzas import revisar as rev


class S3Falso:
    """Cliente S3 en memoria con los métodos que usa publicar.py. `falla_en` hace fallar la subida de esa clave."""

    def __init__(self, falla_en=None, tam_distinto=False, falla_copia=False):
        self.objetos: dict[str, bytes] = {}
        self.falla_en, self.tam_distinto, self.falla_copia = falla_en, tam_distinto, falla_copia
        self.cabeceras: dict[str, dict] = {}

    def upload_file(self, ruta, bucket, clave, ExtraArgs=None):
        if self.falla_en and self.falla_en in clave:
            raise ConnectionError("se cayó la conexión")
        with open(ruta, "rb") as f:
            self.objetos[clave] = f.read()
        self.cabeceras[clave] = ExtraArgs or {}

    def head_object(self, Bucket, Key):
        n = len(self.objetos[Key]) + (1 if self.tam_distinto else 0)
        return {"ContentLength": n}

    def copy_object(self, Bucket, Key, CopySource, **kw):
        if self.falla_copia:
            raise ConnectionError("falló la copia")
        self.objetos[Key] = self.objetos[CopySource["Key"]]
        self.cabeceras[Key] = kw

    def put_object(self, Bucket, Key, Body, **kw):
        self.objetos[Key] = Body
        self.cabeceras[Key] = kw

    def delete_object(self, Bucket, Key):
        self.objetos.pop(Key, None)

    def get_object(self, Bucket, Key):
        if Key not in self.objetos:
            raise KeyError(Key)
        import io
        return {"Body": io.BytesIO(self.objetos[Key])}


@pytest.fixture
def data(tmp_path):
    gold = tmp_path / "gold"
    gold.mkdir()
    pd.DataFrame({"nit": [1, 2, 3], "anio": [2023, 2024, 2024], "activo_total": [1, 2, 3]}).to_parquet(gold / "estados.parquet")
    pd.DataFrame({"nit": [1, 2], "anio": [2024, 2024]}).to_parquet(gold / "empresas_anio.parquet")
    pd.DataFrame({"nit": [1, 2]}).to_parquet(gold / "empresas.parquet")
    for nombre in pub.ARCHIVOS:  # el resto de las tablas del gold (Fase 3): contenido mínimo
        if not (gold / nombre).exists():
            if nombre.endswith(".json"):
                (gold / nombre).write_text("{}", encoding="utf-8")
            else:
                pd.DataFrame({"nit": [1]}).to_parquet(gold / nombre)
    (tmp_path / "bronze").mkdir()
    (tmp_path / "bronze" / "_meta.json").write_text(json.dumps({"esf": 111, "caratula": 222}), encoding="utf-8")
    return tmp_path


def claves(s3, prefijo):
    return sorted(k for k in s3.objetos if k.startswith(prefijo))


def test_metadatos_traen_hashes_fuentes_y_licencia(data):
    m = pub.construir_metadatos(data, {"nucleo_minimo": 0.96})
    assert m["anios"] == [2023, 2024] and m["filas"]["estados"] == 3 and m["filas"]["empresas_anio"] == 2 and m["filas"]["empresas"] == 2
    assert {"indicadores", "pares", "senales", "sector_anio", "sector_resumen", "ciiu"} <= set(m["filas"])
    assert set(m["archivos"]) == set(pub.ARCHIVOS) and len(m["archivos"]["estados.parquet"]["sha256"]) == 64
    assert m["fuentes"]["esf"] == {"id": "pfdp-zks5", "actualizado": 111}
    assert m["licencia"] == "CC BY-SA 4.0" and "Superintendencia de Sociedades" in m["atribucion"] and m["calidad"]["nucleo_minimo"] == 0.96


def test_publicacion_completa_deja_gold_y_borra_staging(data):
    s3 = S3Falso()
    meta = pub.construir_metadatos(data)
    publicadas = pub.publicar(s3, "bucket", data, meta, "42")
    esperado = sorted([f"finanzas/gold/{a}" for a in pub.ARCHIVOS] + ["finanzas/gold/metadatos.json"])
    assert claves(s3, "finanzas/gold/") == esperado
    assert "finanzas/gold/catalogos.json" in esperado and "finanzas/gold/indicadores.parquet" in esperado
    assert claves(s3, "finanzas/staging/") == []
    assert publicadas[-1] == "finanzas/gold/metadatos.json"  # los metadatos se escriben al final
    assert s3.objetos["finanzas/gold/estados.parquet"] == (data / "gold" / "estados.parquet").read_bytes()
    assert json.loads(s3.objetos["finanzas/gold/metadatos.json"])["archivos"]["estados.parquet"]["bytes"] > 0


def test_si_falla_la_subida_gold_queda_intacto(data):
    s3 = S3Falso(falla_en="empresas_anio")
    s3.objetos["finanzas/gold/estados.parquet"] = b"version anterior"
    with pytest.raises(ConnectionError):
        pub.publicar(s3, "bucket", data, pub.construir_metadatos(data), "43")
    assert s3.objetos["finanzas/gold/estados.parquet"] == b"version anterior"
    assert "finanzas/gold/metadatos.json" not in s3.objetos
    assert claves(s3, "finanzas/staging/") == []  # no deja basura


def test_si_el_tamano_no_coincide_no_se_publica_nada(data):
    s3 = S3Falso(tam_distinto=True)
    with pytest.raises(RuntimeError, match="no se publica nada"):
        pub.publicar(s3, "bucket", data, pub.construir_metadatos(data), "44")
    assert claves(s3, "finanzas/gold/") == [] and claves(s3, "finanzas/staging/") == []


def test_las_cabeceras_de_cache_se_envian(data):
    s3 = S3Falso()
    pub.publicar(s3, "bucket", data, pub.construir_metadatos(data), "45")
    assert s3.cabeceras["finanzas/staging/45/estados.parquet"]["CacheControl"] == pub.CACHE
    assert s3.cabeceras["finanzas/gold/estados.parquet"]["CacheControl"] == pub.CACHE
    assert s3.cabeceras["finanzas/gold/estados.parquet"]["ContentType"] == "application/vnd.apache.parquet"
    assert s3.cabeceras["finanzas/gold/metadatos.json"]["ContentType"] == "application/json"


def test_publicar_sin_credenciales_es_simulacion(data, monkeypatch, capsys):
    for v in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET"):
        monkeypatch.delenv(v, raising=False)
    monkeypatch.setattr(pub, "DATA", data)
    monkeypatch.setattr(pub.val, "validar", lambda d: ([], [], {}))
    monkeypatch.setattr(pub.r2, "cliente", lambda: pytest.fail("no debe crear un cliente sin credenciales"))
    assert pub.main() == 0
    assert "SIMULACIÓN" in capsys.readouterr().out


def test_decidir_reconstruccion():
    actuales = {"esf": 2, "eri": 2}
    igual = {"esf": 2, "eri": 2}
    assert rev.decidir(actuales, igual, manual=False) == (False, "la fuente no cambió desde la última publicación")
    ok, motivo = rev.decidir(actuales, {"esf": 2, "eri": 1}, manual=False)
    assert ok and "eri" in motivo
    assert rev.decidir(actuales, igual, manual=True)[0]  # lo manual siempre reconstruye
    assert rev.decidir(actuales, igual, manual=False, forzar=True)[0]
    assert rev.decidir(actuales, None, manual=False)[0]  # nada publicado todavía


def test_fuentes_publicadas_lee_los_metadatos(monkeypatch):
    for v, x in (("R2_ACCESS_KEY_ID", "a"), ("R2_SECRET_ACCESS_KEY", "b"), ("R2_ENDPOINT", "c"), ("R2_BUCKET", "d")):
        monkeypatch.setenv(v, x)
    s3 = S3Falso()
    assert rev.fuentes_publicadas(s3, "d") is None  # primera vez: no hay metadatos
    s3.objetos["finanzas/gold/metadatos.json"] = json.dumps({"fuentes": {"esf": {"id": "x", "actualizado": 7}}}).encode()
    assert rev.fuentes_publicadas(s3, "d") == {"esf": 7}


def test_fuentes_publicadas_sin_credenciales(monkeypatch):
    for v in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET"):
        monkeypatch.delenv(v, raising=False)
    assert rev.fuentes_publicadas() is None
