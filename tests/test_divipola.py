import pytest

from pipelines.common.divipola import _coord, normalizar_cod_mpio


@pytest.mark.parametrize("entrada,esperado", [
    ("05001", "05001"), ("5001", "05001"), (5001, "05001"), ("05001.0", "05001"),
    (" 11001 ", "11001"), ("", None), (None, None), ("ABC", None), ("123456", None),
])
def test_normalizar_cod_mpio(entrada, esperado):
    assert normalizar_cod_mpio(entrada) == esperado


def test_coord_con_coma_decimal():
    assert _coord("-75,581775") == pytest.approx(-75.581775)
    assert _coord("x") is None
