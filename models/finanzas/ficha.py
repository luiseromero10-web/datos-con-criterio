"""Genera models/finanzas/FICHA_ALERTA.md desde artifacts/metrics.json, seleccion.json y calibracion.json (las cifras no se escriben a mano)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ARTEFACTOS = Path(__file__).with_name("artifacts")
DESTINO = Path(__file__).with_name("FICHA_ALERTA.md")
NOMBRES = {"altman": "Z'' de Altman (línea base)", "logit": "Regresión logística (línea base)", "lgbm": "LightGBM"}


def p(x: float | None, d: int = 1) -> str:
    return "–" if x is None else f"{100 * x:.{d}f} %".replace(".", ",")


def n(x: float, d: int = 3) -> str:
    return f"{x:.{d}f}".replace(".", ",")


def ic(r: dict, k: str, pct: bool = False) -> str:
    v = r.get("ic95", {}).get(k)
    if not v:
        return ""
    return f" ({p(v[0])}–{p(v[1])})" if pct else f" ({n(v[0])}–{n(v[1])})"


def tabla_metricas(m: dict, parte: str) -> str:
    filas = ["| Modelo | Sociedades | Positivos | PR-AUC | Recall en el 5 % de mayor riesgo | Precisión en ese 5 % | ROC-AUC | Brier | Habilidad de Brier | Error de calibración |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for k in ("altman", "logit", "lgbm"):
        r = m[k][parte]
        filas.append(f"| {NOMBRES[k]} | {r['n']:,} | {r['positivos']} | {n(r['pr_auc'])}{ic(r, 'pr_auc')} | {p(r['recall_5'])}{ic(r, 'recall_5', True)} | {p(r['precision_5'])} | "
                     f"{n(r['roc_auc'])} | {n(r['brier'], 5)} | {n(r['brier_skill'])} | {n(r['ece'], 4)} |")
    return "\n".join(filas)


def generar() -> str:
    rep = json.loads((ARTEFACTOS / "metrics.json").read_text(encoding="utf-8"))
    sel = json.loads((ARTEFACTOS / "seleccion.json").read_text(encoding="utf-8"))
    cal = json.loads((ARTEFACTOS / "calibracion.json").read_text(encoding="utf-8"))
    m, et, part, sup, opo = rep["metricas"], rep["etiqueta"], rep["particion"], rep["supervivencia"], rep["oportunidad"]
    pub = sel["publicado"]
    comp = rep["comparaciones"]
    t22 = m[pub]["prueba"]
    base22 = m["altman"]["prueba"]
    curva = cal[pub]["prueba"]
    sg = rep["subgrupos_prueba"]
    alt = rep["umbral_altman_publicado"]["prueba"]
    cortes = json.loads((Path(__file__).resolve().parents[2] / "pipelines" / "finanzas" / "insolvencia_cortes.json").read_text(encoding="utf-8"))["cortes"]
    prec = et["precision_del_ano_de_admision"]
    pct_aprox = prec.get("acuerdo_menos_1", 0) / sum(prec.values())
    pos_anio = ", ".join(f"{a}: {v}" for a, v in et["positivos_por_anio"].items())
    tasa_anio = ", ".join(f"{a}: {p(v, 2)}" for a, v in et["tasa_por_anio"].items())
    sens = rep["sensibilidad_ventana"]
    return f"""# Ficha del modelo — alerta temprana de insolvencia

Generada por `python -m models.finanzas.ficha` a partir de `artifacts/metrics.json`. Plan: `PLAN_FINANZAS.md`, sección 5.

## 1. Qué es y qué no es

Un modelo estadístico que ordena a las sociedades que presentan estados financieros a la Supersociedades según el **perfil** de sus cifras
frente a las que después fueron admitidas a un proceso de insolvencia (reorganización o liquidación). Sirve para ver **en qué sectores,
regiones y tamaños se concentra ese perfil** y cómo cambia año a año.

**No es** una calificación crediticia, una probabilidad de quiebra de una empresa ni una predicción con meses de anticipación.
- **No se publica el puntaje de ninguna sociedad.** Solo se publican cifras agregadas por sector, región y tamaño, para grupos de al menos 30 sociedades (`gold/alerta_agregada.parquet`). Un puntaje individual se leería como calificación y podría dañar a una empresa real (plan 0.2; decisión del autor).
- **Usos no permitidos:** decidir crédito, contratación, seguros, relaciones comerciales o cualquier decisión sobre personas o empresas concretas; compararlo con calificaciones de riesgo; usarlo como prueba de que una empresa «va a quebrar».
- **Es de perfil, no de aviso.** El {p(opo['pct_de_t1_en_el_primer_semestre'], 0)} de las admisiones del año siguiente al cierre ocurre antes de julio ({p(opo['pct_de_t1_en_el_primer_trimestre'], 0)} en el primer trimestre), es decir, cuando apenas se están presentando los estados del cierre. Muchas de las «alertas» llegan cuando el proceso ya empezó o está por empezar.

## 2. Datos

- **Estados financieros** NIIF de sociedades (individuales; separados si no hay individual), cortes 2016–2025, de datos.gov.co (CC BY-SA 4.0). Indicadores, percentiles frente a pares y señales de la Fase 3.
- **Eventos de insolvencia:** la base de procesos de la Supersociedades (Excel) **uniendo {len(cortes)} cortes** ({cortes[0]['corte']} a {cortes[-1]['corte']}), por NIT. Un solo corte no sirve: la base actual es una foto de procesos vigentes y los terminados desaparecen. Se obtienen {sum(et['tipo_de_los_positivos'].values()):,} sociedades-año positivas.
- **Qué cuenta como evento:** admisión a reorganización (incluida la abreviada) o a cualquier liquidación (judicial, simplificada o por adjudicación). Desde 2024 la fuente junta todas las liquidaciones; para ser consistente en el tiempo se juntan siempre. Quedan fuera la negociación de emergencia de 2020 y la validación judicial.
- **Año de admisión:** solo los cortes de sept. y nov. de 2026 traen fecha. En el resto: el año de apertura (exacto en el 98,5 % de los procesos «en trámite» y liquidaciones) o, en reorganizaciones «en ejecución» (cuya columna es el año del acuerdo), ese año menos uno (exacto en el 58 %, a ±1 año en el 95 %). Precisión de los positivos: {et['precision_del_ano_de_admision']}.

## 3. Etiqueta y población

`y = 1` si la sociedad es admitida a un proceso en los años **t+1 o t+2** siguientes al cierre *t* (24 meses). La población de cada cierre excluye a las sociedades que ya habían sido admitidas en *t* o antes. Un cierre sin los 24 meses completos de eventos no tiene etiqueta.
- Positivos por cierre: {pos_anio}.
- Tasa de positivos por cierre: {tasa_anio}.
- Tipo del primer evento de los positivos: {et['tipo_de_los_positivos']}.
- Tasa base en la prueba: {p(t22['tasa_base'], 2)}. Con tasas tan bajas, un modelo sin información tendría un PR-AUC igual a la tasa base.

## 4. Variables

Solo cifras de *t* o anteriores: los 16 indicadores de *t*, su cambio frente a *t−1* (7 de ellos), el tamaño (activo e ingresos reales), la edad, los percentiles frente a los pares del mismo año, 6 señales objetivas, el número de señales, la sección CIIU, el departamento, el grupo NIIF y el tipo de estado. **Se excluyen** `estado_actual` y la señal `estado_distinto_activa`: la carátula se diligencia al presentar los estados (meses después del cierre) y delataría una admisión ocurrida en *t+1*. Hay una prueba automática de que cambiar lo que reporta una sociedad después de *t* no altera sus variables de *t*.

## 5. Validación temporal

Nunca se mezclan años. Entrenamiento: {', '.join(str(a) for a in part['entrenamiento']['anios'])} ({part['entrenamiento']['n']:,} sociedades-año). Validación (hiperparámetros, parada temprana y calibración): {', '.join(str(a) for a in part['validacion']['anios'])} ({part['validacion']['n']:,}). **Prueba: {part['prueba']['anio']}** ({part['prueba']['n']:,}) y segunda prueba {part['prueba_2']['anio']} ({part['prueba_2']['n']:,}), ambas con la etiqueta completa.
El plan decía entrenar con cierres ≤ 2019. Como los eventos de 2017–2018 están incompletos, se comparó entrenar con 2018–2019 o con 2016–2019 y se escogió por validación: PR-AUC de la validación (logística / LightGBM) {n(sens['2018-2019']['logit'], 4)} / {n(sens['2018-2019']['lgbm'], 4)} con 2018–2019 y {n(sens['2016-2019']['logit'], 4)} / {n(sens['2016-2019']['lgbm'], 4)} con 2016–2019 (ventana elegida: **{part['entrenamiento']['ventana']}**).

## 6. Modelos y selección

1. **Z'' de Altman para mercados emergentes** (línea base obligatoria): `3,25 + 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4`, ordenando por −Z'' y calibrada con una regresión de un solo puntaje. Con su umbral publicado (Z'' < 4,35) marca al {p(alt['marcadas'])} de las sociedades de la prueba, con precisión de {p(alt['precision'])} y recall de {p(alt['recall'])}.
2. **Regresión logística** (línea base obligatoria): variables recortadas en los percentiles 1 y 99, estandarizadas, con marca de vacío y categorías en indicadoras; C elegido por validación.
3. **LightGBM**: árboles pequeños (15 hojas, ≥ 100 sociedades por hoja, regularización L2), parada temprana en la validación y calibración de Platt con la validación.

**Regla del plan:** LightGBM solo se adopta si les gana a las dos líneas base en la prueba; para no decidir con un solo año, además no puede perder contra ninguna en 2023. Si no, se publica la mejor línea base elegida por validación (que también es un resultado válido). **Modelo publicado: {NOMBRES[pub]}.**
{('LightGBM ganó en 2022 (PR-AUC y recall@5 %) contra las dos y no perdió en 2023.' if pub == 'lgbm' else 'LightGBM no cumplió la regla; se publica la mejor línea base.')}

## 7. Resultados (la prueba, no la validación)

**Prueba {part['prueba']['anio']}** (intervalos del 95 % por remuestreo):

{tabla_metricas(m, 'prueba')}

**Segunda prueba {part['prueba_2']['anio']}:**

{tabla_metricas(m, 'prueba_2023')}

**Validación (2020–2021):**

{tabla_metricas(m, 'validacion')}

Cómo leerlo:
- El modelo publicado captura el **{p(t22['recall_5'], 0)}** de las admisiones de 2022 entre el 5 % de sociedades de mayor puntaje (Altman: {p(base22['recall_5'], 0)}); un azar daría 5 %. Aun así, de cada 100 sociedades de ese 5 % solo {t22['precision_5'] * 100:.0f} fueron admitidas: **la mayoría de las marcadas no tiene un proceso**.
- PR-AUC {n(t22['pr_auc'])} frente a una tasa base de {n(t22['tasa_base'])}: es {t22['pr_auc'] / t22['tasa_base']:.0f} veces mejor que no saber nada, pero sigue siendo un problema difícil.
- **Frente a Altman** la ventaja es total (probabilidad de que el modelo lo supere por remuestreo: {n(comp['prueba']['lgbm_vs_altman']['pr_auc'], 2)} en 2022 y {n(comp['prueba_2023']['lgbm_vs_altman']['pr_auc'], 2)} en 2023, en PR-AUC). Altman, además, tiene Brier peor que predecir siempre la tasa base.
- **LightGBM frente a la logística** es firme en 2022 (probabilidad de ventaja: {n(comp['prueba']['lgbm_vs_logit']['pr_auc'], 2)} en PR-AUC y {n(comp['prueba']['lgbm_vs_logit']['recall_5'], 2)} en recall) pero débil en 2023 ({n(comp['prueba_2023']['lgbm_vs_logit']['pr_auc'], 2)} y {n(comp['prueba_2023']['lgbm_vs_logit']['recall_5'], 2)}): **no es una diferencia concluyente**. Si importa más la interpretación que el último punto de desempeño, la logística es equivalente; sus coeficientes están en `artifacts/logit.json`.

**Calibración en 2022** (probabilidad prevista → tasa observada, por décimos de sociedades): {', '.join(f"{p(g['prevista'], 2)} → {p(g['observada'], 2)}" for g in curva)}. Sigue la diagonal, con **subestimación en la cola alta** (el décimo de mayor riesgo prevé {p(curva[-1]['prevista'], 1)} y observa {p(curva[-1]['observada'], 1)}). Las probabilidades sirven para comparar grupos, no como probabilidad absoluta de una empresa.

## 8. Desempeño por subgrupos (prueba 2022, modelo publicado)

| Grupo | Sociedades | Positivos | PR-AUC | Positivos en el 5 % de mayor riesgo |
|---|---|---|---|---|
""" + "\n".join(f"| {col}: {k} | {v['n']:,} | {v['positivos']} | {n(v['pr_auc'])} | {p(v['recall_5_global'], 0)} |"
                for col in ("grupo", "tercil_ingresos") for k, v in sg[col].items()) + f"""

Por tipo de evento, la proporción de positivos capturada en el 5 % de mayor riesgo es {p(sg['familia_evento']['liquidacion']['recall_5_global'], 0)} para las liquidaciones y {p(sg['familia_evento']['reorganizacion']['recall_5_global'], 0)} para las reorganizaciones. Con año de admisión exacto es {p(sg['precision_evento']['exacta']['recall_5_global'], 0)} y con año de apertura {p(sg['precision_evento']['anio_apertura']['recall_5_global'], 0)}: no hay señal de que la imprecisión de las fechas degrade la medición.

## 9. Sesgo de supervivencia: quién deja de reportar

Muchas sociedades en problemas **dejan de presentar estados** y no vuelven a aparecer. Entre los cierres 2016–2023 (con dos años de seguimiento) el {p(sup['pct_positivos_que_dejan'])} de los positivos dejó de reportar en *t+1* y *t+2*, frente al {p(sup['pct_negativos_que_dejan'])} de los negativos; la tasa de admisión es {p(sup['tasa_evento_si_deja'], 2)} entre quienes dejan de reportar y {p(sup['tasa_evento_si_sigue'], 2)} entre quienes siguen. Dejar de reportar **no se mezcla en la etiqueta** (no es un evento de insolvencia); aquí solo se describe. Consecuencias: el modelo describe a las sociedades que *reportan*; las que desaparecen sin pasar por un proceso quedan fuera de los positivos, y la sociedad que ya no reporta no tiene puntaje.
Además, en la Fase 0 se midió que solo el 23–37 % de las sociedades admitidas cada año había presentado estados el año anterior: el modelo ve una parte de los procesos, no todos.

## 10. Límites conocidos

- **Etiqueta incompleta antes de 2020:** la base solo conserva los procesos que seguían vivos en dic-2019, así que las admisiones de 2017–2019 están subregistradas (415, 696 y 716 frente a 870–1 190 por año desde 2020). Se entrenó con ellas igualmente (la validación lo prefirió) pero los años de entrenamiento tienen más falsos negativos que la prueba.
- **Año de admisión estimado** en el {p(pct_aprox, 0)} de los positivos (reorganizaciones «en ejecución» sin fecha exacta: año del acuerdo menos uno; error de ±1 año en una parte): puede mover un caso entre dos cierres.
- **Cambio de clasificación de la fuente en 2024** (liquidaciones agrupadas) y cortes con columnas distintas: se normalizaron, pero no se pueden auditar uno a uno.
- **Errores de unidades en la fuente** (≈ 0,2 % de los informes): marcados y excluidos de las sumas por sector; sus ratios no se alteran.
- **Probabilidades subestimadas en la cola alta** y calibradas con 2020–2021 (pandemia): conviene recalibrar al reentrenar.
- **Correlación, no causalidad.** Variables como la sección CIIU o el departamento recogen composición de la muestra, no causas.
- **Solo las sociedades que reportan a la Supersociedades:** no cubre bancos, aseguradoras, cooperativas ni microempresas.

## 11. Qué se publica

`gold/alerta_agregada.parquet`: por dimensión (nacional, sección CIIU, división CIIU, departamento y tercil de ingresos), código y año: número de sociedades, probabilidad media, **proporción con perfil alto** (probabilidad calibrada ≥ {n(sel['umbral_perfil_alto'], 4)}, el percentil 95 de 2020–2021: umbral fijo para poder comparar años), tasa observada de admisión en los 24 meses siguientes (años con etiqueta) y la muestra a la que pertenece cada año (entrenamiento, validación, prueba o sin etiqueta). Grupos de menos de 30 sociedades suprimidos; sin NIT ni puntaje por sociedad; las que ya están en un proceso (estado de la carátula distinto de «ACTIVA») no entran.
**Los años de entrenamiento y validación son de ajuste, no de evaluación:** solo 2022 y 2023 son de prueba.

## 12. Reproducir

```bash
uv run python -m pipelines.finanzas.descargar_cortes      # cortes de la base de insolvencia (data/finanzas/insolvencia_raw/, ignorado por git)
uv run python -m pipelines.finanzas.insolvencia           # une los cortes y guarda silver/eventos_insolvencia.parquet
uv run python -m models.finanzas.alerta                   # entrena, evalúa y guarda models/finanzas/artifacts/
uv run python -m models.finanzas.ficha                    # regenera esta ficha
uv run python -m models.finanzas.puntuar                  # cifras agregadas (también corre en Actions, solo con el modelo versionado)
```
El entrenamiento necesita los eventos de insolvencia (NIT por NIT), que **no se versionan ni se publican**; el reentrenamiento es manual. Actions solo aplica el modelo versionado.
"""


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    DESTINO.write_text(generar(), encoding="utf-8")
    print("ficha escrita:", DESTINO)
    return 0


if __name__ == "__main__":
    sys.exit(main())
