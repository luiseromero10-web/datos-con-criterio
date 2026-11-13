"""Modelos del sistema de alerta temprana: Z'' de Altman (línea base 1), regresión logística (línea base 2) y LightGBM.

Todos exponen `probabilidad(df)` con una probabilidad calibrada de admisión a insolvencia en los 24 meses siguientes y se
guardan como JSON (Altman y logística) o como texto nativo de LightGBM, sin pickle, para poder versionarlos y revisarlos.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from models.finanzas.datos import CATEGORICAS, NUMERICAS

MIN_FRECUENCIA = 200  # categorías con menos filas de entrenamiento se agrupan en «otros»
MAX_FALTANTES_SIN_MARCA = 0.02  # una variable con más de 2 % de vacíos lleva su marca de «vacío»
RECORTE = (0.01, 0.99)


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return np.log(p / (1 - p))


def sigmoide(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -50, 50)))


@dataclass
class Platt:
    """Calibración logística de un puntaje: p = sigmoide(a · puntaje + b)."""
    a: float = 1.0
    b: float = 0.0

    @classmethod
    def ajustar(cls, puntaje: np.ndarray, y: np.ndarray) -> Platt:
        ok = np.isfinite(puntaje)
        m = LogisticRegression(C=1e6, max_iter=1000).fit(puntaje[ok].reshape(-1, 1), y[ok])
        return cls(float(m.coef_[0, 0]), float(m.intercept_[0]))

    def __call__(self, puntaje: np.ndarray) -> np.ndarray:
        return sigmoide(self.a * np.asarray(puntaje, float) + self.b)


# --------------------------------------------------------------------------- línea base 1: Altman
@dataclass
class ModeloAltman:
    """El puntaje de riesgo es −Z''. Se calibra con una regresión de un solo puntaje (el umbral publicado 4,35 no da probabilidades)."""
    platt: Platt = field(default_factory=Platt)
    limite_z: float = 20.0  # un Z'' extremo (pasivos casi nulos) se acota para la calibración; el orden no cambia

    def puntaje(self, df: pd.DataFrame) -> np.ndarray:
        return -np.clip(df["altman_z2"].to_numpy(float), -self.limite_z, self.limite_z)

    def ajustar(self, df: pd.DataFrame, y: np.ndarray) -> ModeloAltman:
        self.platt = Platt.ajustar(self.puntaje(df), y)
        return self

    def probabilidad(self, df: pd.DataFrame) -> np.ndarray:
        s = self.puntaje(df)
        p = self.platt(np.nan_to_num(s, nan=0.0))
        return np.where(np.isfinite(s), p, np.nan)

    def a_json(self) -> dict:
        return {"tipo": "altman", "platt": {"a": self.platt.a, "b": self.platt.b}, "limite_z": self.limite_z}

    @classmethod
    def de_json(cls, d: dict) -> ModeloAltman:
        return cls(Platt(**d["platt"]), d["limite_z"])


# --------------------------------------------------------------------------- línea base 2: logística
@dataclass
class PrepLineal:
    """Recorta colas, imputa con la mediana, marca vacíos, estandariza y codifica categorías. Todo aprendido en entrenamiento."""
    numericas: tuple[str, ...] = NUMERICAS
    categoricas: tuple[str, ...] = CATEGORICAS
    params: dict = field(default_factory=dict)

    def ajustar(self, df: pd.DataFrame) -> PrepLineal:
        p: dict = {"num": {}, "cat": {}}
        for c in self.numericas:
            x = df[c].astype("float64")
            lo, hi = (float(x.quantile(q)) for q in RECORTE) if x.notna().any() else (0.0, 0.0)
            xc = x.clip(lo, hi)
            mu = float(xc.mean()) if xc.notna().any() else 0.0
            sd = float(xc.std()) if xc.notna().sum() > 1 else 1.0
            p["num"][c] = {"lo": lo, "hi": hi, "mediana": float(xc.median()) if xc.notna().any() else 0.0, "media": mu, "sd": sd or 1.0,
                           "marca": bool(x.isna().mean() > MAX_FALTANTES_SIN_MARCA)}
        for c in self.categoricas:
            f = df[c].astype("string").fillna("(vacío)").value_counts()
            p["cat"][c] = sorted(f[f >= MIN_FRECUENCIA].index.tolist())
        self.params = p
        return self

    def nombres(self) -> list[str]:
        n = [c for c in self.numericas] + [f"{c}__vacio" for c, v in self.params["num"].items() if v["marca"]]
        for c, cats in self.params["cat"].items():
            n += [f"{c}={v}" for v in cats] + [f"{c}=otros"]
        return n

    def transformar(self, df: pd.DataFrame) -> np.ndarray:
        cols = []
        for c, v in self.params["num"].items():
            x = df[c].astype("float64")
            xc = x.clip(v["lo"], v["hi"]).fillna(v["mediana"])
            cols.append(((xc - v["media"]) / v["sd"]).to_numpy())
        for c, v in self.params["num"].items():
            if v["marca"]:
                cols.append(df[c].isna().astype("float64").to_numpy())
        for c, cats in self.params["cat"].items():
            s = df[c].astype("string").fillna("(vacío)")
            for k in cats:
                cols.append((s == k).astype("float64").to_numpy())
            cols.append((~s.isin(cats)).astype("float64").to_numpy())
        return np.column_stack(cols)


@dataclass
class ModeloLogit:
    prep: PrepLineal = field(default_factory=PrepLineal)
    coef: np.ndarray | None = None
    intercepto: float = 0.0
    C: float = 0.1

    def ajustar(self, df: pd.DataFrame, y: np.ndarray) -> ModeloLogit:
        self.prep.ajustar(df)
        m = LogisticRegression(C=self.C, max_iter=3000, solver="lbfgs").fit(self.prep.transformar(df), y)
        self.coef, self.intercepto = m.coef_[0], float(m.intercept_[0])
        return self

    def puntaje(self, df: pd.DataFrame) -> np.ndarray:
        return self.prep.transformar(df) @ self.coef + self.intercepto

    def probabilidad(self, df: pd.DataFrame) -> np.ndarray:
        return sigmoide(self.puntaje(df))

    def coeficientes(self, n: int = 15) -> list[dict]:
        t = pd.DataFrame({"variable": self.prep.nombres(), "coef": self.coef}).assign(abs=lambda d: d["coef"].abs())
        return t.sort_values("abs", ascending=False).head(n)[["variable", "coef"]].round(4).to_dict("records")

    def a_json(self) -> dict:
        return {"tipo": "logit", "C": self.C, "intercepto": self.intercepto, "coef": self.coef.tolist(), "prep": self.prep.params,
                "numericas": list(self.prep.numericas), "categoricas": list(self.prep.categoricas)}

    @classmethod
    def de_json(cls, d: dict) -> ModeloLogit:
        prep = PrepLineal(tuple(d["numericas"]), tuple(d["categoricas"]), d["prep"])
        return cls(prep, np.array(d["coef"]), d["intercepto"], d["C"])


# --------------------------------------------------------------------------- LightGBM
PARAMS_LGBM = {
    "objective": "binary", "metric": "average_precision", "learning_rate": 0.03, "num_leaves": 15, "min_child_samples": 100,
    "feature_fraction": 0.8, "bagging_fraction": 0.8, "bagging_freq": 1, "lambda_l2": 5.0, "verbosity": -1, "seed": 7, "num_threads": 4,
}


def _para_lgbm(df: pd.DataFrame, categorias: dict[str, list[str]] | None = None) -> tuple[pd.DataFrame, dict[str, list[str]]]:
    x = df[list(NUMERICAS)].astype("float64").copy()
    categorias = categorias or {c: sorted(df[c].dropna().astype(str).unique().tolist()) for c in CATEGORICAS}
    for c in CATEGORICAS:
        x[c] = pd.Categorical(df[c].astype("string").where(df[c].notna()), categories=categorias[c])
    return x, categorias


@dataclass
class ModeloLgbm:
    booster: lgb.Booster | None = None
    categorias: dict[str, list[str]] = field(default_factory=dict)
    platt: Platt = field(default_factory=Platt)
    iteraciones: int = 0

    def ajustar(self, tr: pd.DataFrame, ytr: np.ndarray, va: pd.DataFrame, yva: np.ndarray, max_arboles: int = 1500) -> ModeloLgbm:
        xtr, self.categorias = _para_lgbm(tr)
        xva, _ = _para_lgbm(va, self.categorias)
        self.booster = lgb.train(PARAMS_LGBM, lgb.Dataset(xtr, ytr), num_boost_round=max_arboles, valid_sets=[lgb.Dataset(xva, yva)],
                                 callbacks=[lgb.early_stopping(100, verbose=False)])
        self.iteraciones = int(self.booster.best_iteration or max_arboles)
        self.platt = Platt.ajustar(self._crudo(va), yva)  # calibración con la validación; la prueba queda intacta
        return self

    def _crudo(self, df: pd.DataFrame) -> np.ndarray:
        x, _ = _para_lgbm(df, self.categorias)
        return logit(self.booster.predict(x, num_iteration=self.iteraciones))

    def puntaje(self, df: pd.DataFrame) -> np.ndarray:
        return self._crudo(df)

    def probabilidad(self, df: pd.DataFrame) -> np.ndarray:
        return self.platt(self._crudo(df))

    def importancias(self, n: int = 15) -> list[dict]:
        imp = pd.DataFrame({"variable": self.booster.feature_name(), "ganancia": self.booster.feature_importance("gain")})
        imp["ganancia"] = imp["ganancia"] / imp["ganancia"].sum()
        return imp.sort_values("ganancia", ascending=False).head(n).round(4).to_dict("records")

    def guardar(self, carpeta: Path) -> None:
        self.booster.save_model(str(carpeta / "lgbm.txt"), num_iteration=self.iteraciones)
        (carpeta / "lgbm.json").write_text(json.dumps({"tipo": "lgbm", "categorias": self.categorias, "platt": {"a": self.platt.a, "b": self.platt.b},
                                                       "iteraciones": self.iteraciones}, ensure_ascii=False, indent=1), encoding="utf-8")

    @classmethod
    def cargar(cls, carpeta: Path) -> ModeloLgbm:
        meta = json.loads((carpeta / "lgbm.json").read_text(encoding="utf-8"))
        return cls(lgb.Booster(model_file=str(carpeta / "lgbm.txt")), meta["categorias"], Platt(**meta["platt"]), meta["iteraciones"])

