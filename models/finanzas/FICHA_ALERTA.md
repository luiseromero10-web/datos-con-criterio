# Ficha del modelo — alerta temprana de insolvencia

Generada por `python -m models.finanzas.ficha` a partir de `artifacts/metrics.json`. Plan: `PLAN_FINANZAS.md`, sección 5.

## 1. Qué es y qué no es

Un modelo estadístico que ordena a las sociedades que presentan estados financieros a la Supersociedades según el **perfil** de sus cifras
frente a las que después fueron admitidas a un proceso de insolvencia (reorganización o liquidación). Sirve para ver **en qué sectores,
regiones y tamaños se concentra ese perfil** y cómo cambia año a año.

**No es** una calificación crediticia, una probabilidad de quiebra de una empresa ni una predicción con meses de anticipación.
- **No se publica el puntaje de ninguna sociedad.** Solo se publican cifras agregadas por sector, región y tamaño, para grupos de al menos 30 sociedades (`gold/alerta_agregada.parquet`). Un puntaje individual se leería como calificación y podría dañar a una empresa real (plan 0.2; decisión del autor).
- **Usos no permitidos:** decidir crédito, contratación, seguros, relaciones comerciales o cualquier decisión sobre personas o empresas concretas; compararlo con calificaciones de riesgo; usarlo como prueba de que una empresa «va a quebrar».
- **Es de perfil, no de aviso.** El 47 % de las admisiones del año siguiente al cierre ocurre antes de julio (21 % en el primer trimestre), es decir, cuando apenas se están presentando los estados del cierre. Muchas de las «alertas» llegan cuando el proceso ya empezó o está por empezar.

## 2. Datos

- **Estados financieros** NIIF de sociedades (individuales; separados si no hay individual), cortes 2016–2025, de datos.gov.co (CC BY-SA 4.0). Indicadores, percentiles frente a pares y señales de la Fase 3.
- **Eventos de insolvencia:** la base de procesos de la Supersociedades (Excel) **uniendo 26 cortes** (2019-12 a 2026-11), por NIT. Un solo corte no sirve: la base actual es una foto de procesos vigentes y los terminados desaparecen. Se obtienen 2,644 sociedades-año positivas.
- **Qué cuenta como evento:** admisión a reorganización (incluida la abreviada) o a cualquier liquidación (judicial, simplificada o por adjudicación). Desde 2024 la fuente junta todas las liquidaciones; para ser consistente en el tiempo se juntan siempre. Quedan fuera la negociación de emergencia de 2020 y la validación judicial.
- **Año de admisión:** solo los cortes de sept. y nov. de 2026 traen fecha. En el resto: el año de apertura (exacto en el 98,5 % de los procesos «en trámite» y liquidaciones) o, en reorganizaciones «en ejecución» (cuya columna es el año del acuerdo), ese año menos uno (exacto en el 58 %, a ±1 año en el 95 %). Precisión de los positivos: {'exacta': 2049, 'anio_apertura': 470, 'acuerdo_menos_1': 125}.

## 3. Etiqueta y población

`y = 1` si la sociedad es admitida a un proceso en los años **t+1 o t+2** siguientes al cierre *t* (24 meses). La población de cada cierre excluye a las sociedades que ya habían sido admitidas en *t* o antes. Un cierre sin los 24 meses completos de eventos no tiene etiqueta.
- Positivos por cierre: 2016: 335, 2017: 386, 2018: 405, 2019: 385, 2020: 236, 2021: 255, 2022: 322, 2023: 320.
- Tasa de positivos por cierre: 2016: 1,47 %, 2017: 2,02 %, 2018: 2,20 %, 2019: 1,58 %, 2020: 0,83 %, 2021: 0,93 %, 2022: 1,09 %, 2023: 1,08 %.
- Tipo del primer evento de los positivos: {'reorganizacion': 2215, 'liquidacion': 429}.
- Tasa base en la prueba: 1,09 %. Con tasas tan bajas, un modelo sin información tendría un PR-AUC igual a la tasa base.

## 4. Variables

Solo cifras de *t* o anteriores: los 16 indicadores de *t*, su cambio frente a *t−1* (7 de ellos), el tamaño (activo e ingresos reales), la edad, los percentiles frente a los pares del mismo año, 6 señales objetivas, el número de señales, la sección CIIU, el departamento, el grupo NIIF y el tipo de estado. **Se excluyen** `estado_actual` y la señal `estado_distinto_activa`: la carátula se diligencia al presentar los estados (meses después del cierre) y delataría una admisión ocurrida en *t+1*. Hay una prueba automática de que cambiar lo que reporta una sociedad después de *t* no altera sus variables de *t*.

## 5. Validación temporal

Nunca se mezclan años. Entrenamiento: 2016, 2017, 2018, 2019 (84,674 sociedades-año). Validación (hiperparámetros, parada temprana y calibración): 2020, 2021 (55,853). **Prueba: 2022** (29,434) y segunda prueba 2023 (29,586), ambas con la etiqueta completa.
El plan decía entrenar con cierres ≤ 2019. Como los eventos de 2017–2018 están incompletos, se comparó entrenar con 2018–2019 o con 2016–2019 y se escogió por validación: PR-AUC de la validación (logística / LightGBM) 0,0782 / 0,0733 con 2018–2019 y 0,0898 / 0,0785 con 2016–2019 (ventana elegida: **2016-2019**).

## 6. Modelos y selección

1. **Z'' de Altman para mercados emergentes** (línea base obligatoria): `3,25 + 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4`, ordenando por −Z'' y calibrada con una regresión de un solo puntaje. Con su umbral publicado (Z'' < 4,35) marca al 14,3 % de las sociedades de la prueba, con precisión de 2,8 % y recall de 37,3 %.
2. **Regresión logística** (línea base obligatoria): variables recortadas en los percentiles 1 y 99, estandarizadas, con marca de vacío y categorías en indicadoras; C elegido por validación.
3. **LightGBM**: árboles pequeños (15 hojas, ≥ 100 sociedades por hoja, regularización L2), parada temprana en la validación y calibración de Platt con la validación.

**Regla del plan:** LightGBM solo se adopta si les gana a las dos líneas base en la prueba; para no decidir con un solo año, además no puede perder contra ninguna en 2023. Si no, se publica la mejor línea base elegida por validación (que también es un resultado válido). **Modelo publicado: LightGBM.**
LightGBM ganó en 2022 (PR-AUC y recall@5 %) contra las dos y no perdió en 2023.

## 7. Resultados (la prueba, no la validación)

**Prueba 2022** (intervalos del 95 % por remuestreo):

| Modelo | Sociedades | Positivos | PR-AUC | Recall en el 5 % de mayor riesgo | Precisión en ese 5 % | ROC-AUC | Brier | Habilidad de Brier | Error de calibración |
|---|---|---|---|---|---|---|---|---|---|
| Z'' de Altman (línea base) | 29,080 | 319 | 0,027 (0,023–0,034) | 17,9 % (13,9 %–22,0 %) | 3,9 % | 0,734 | 0,01112 | -0,025 | 0,0060 |
| Regresión logística (línea base) | 29,434 | 322 | 0,087 (0,065–0,122) | 32,6 % (27,7 %–37,7 %) | 7,1 % | 0,824 | 0,01053 | 0,027 | 0,0031 |
| LightGBM | 29,434 | 322 | 0,109 (0,083–0,143) | 42,2 % (36,9 %–47,8 %) | 9,2 % | 0,851 | 0,01030 | 0,048 | 0,0034 |

**Segunda prueba 2023:**

| Modelo | Sociedades | Positivos | PR-AUC | Recall en el 5 % de mayor riesgo | Precisión en ese 5 % | ROC-AUC | Brier | Habilidad de Brier | Error de calibración |
|---|---|---|---|---|---|---|---|---|---|
| Z'' de Altman (línea base) | 29,218 | 320 | 0,025 (0,021–0,030) | 14,1 % (10,3 %–17,5 %) | 3,1 % | 0,732 | 0,01107 | -0,022 | 0,0052 |
| Regresión logística (línea base) | 29,586 | 320 | 0,103 (0,076–0,137) | 37,5 % (32,5 %–42,5 %) | 8,1 % | 0,837 | 0,01027 | 0,040 | 0,0029 |
| LightGBM | 29,586 | 320 | 0,104 (0,082–0,140) | 39,4 % (34,6 %–44,9 %) | 8,5 % | 0,862 | 0,01018 | 0,049 | 0,0032 |

**Validación (2020–2021):**

| Modelo | Sociedades | Positivos | PR-AUC | Recall en el 5 % de mayor riesgo | Precisión en ese 5 % | ROC-AUC | Brier | Habilidad de Brier | Error de calibración |
|---|---|---|---|---|---|---|---|---|---|
| Z'' de Altman (línea base) | 54,401 | 481 | 0,022 | 17,0 % | 3,0 % | 0,738 | 0,00904 | -0,031 | 0,0079 |
| Regresión logística (línea base) | 55,853 | 491 | 0,090 | 39,3 % | 6,9 % | 0,829 | 0,00857 | 0,017 | 0,0059 |
| LightGBM | 55,853 | 491 | 0,079 | 41,8 % | 7,3 % | 0,855 | 0,00838 | 0,038 | 0,0004 |

Cómo leerlo:
- El modelo publicado captura el **42 %** de las admisiones de 2022 entre el 5 % de sociedades de mayor puntaje (Altman: 18 %); un azar daría 5 %. Aun así, de cada 100 sociedades de ese 5 % solo 9 fueron admitidas: **la mayoría de las marcadas no tiene un proceso**.
- PR-AUC 0,109 frente a una tasa base de 0,011: es 10 veces mejor que no saber nada, pero sigue siendo un problema difícil.
- **Frente a Altman** la ventaja es total (probabilidad de que el modelo lo supere por remuestreo: 1,00 en 2022 y 1,00 en 2023, en PR-AUC). Altman, además, tiene Brier peor que predecir siempre la tasa base.
- **LightGBM frente a la logística** es firme en 2022 (probabilidad de ventaja: 0,95 en PR-AUC y 1,00 en recall) pero débil en 2023 (0,61 y 0,81): **no es una diferencia concluyente**. Si importa más la interpretación que el último punto de desempeño, la logística es equivalente; sus coeficientes están en `artifacts/logit.json`.

**Calibración en 2022** (probabilidad prevista → tasa observada, por décimos de sociedades): 0,06 % → 0,03 %, 0,09 % → 0,07 %, 0,13 % → 0,14 %, 0,17 % → 0,27 %, 0,23 % → 0,31 %, 0,31 % → 0,27 %, 0,44 % → 0,68 %, 0,67 % → 1,36 %, 1,20 % → 1,83 %, 4,39 % → 5,98 %. Sigue la diagonal, con **subestimación en la cola alta** (el décimo de mayor riesgo prevé 4,4 % y observa 6,0 %). Las probabilidades sirven para comparar grupos, no como probabilidad absoluta de una empresa.

## 8. Desempeño por subgrupos (prueba 2022, modelo publicado)

| Grupo | Sociedades | Positivos | PR-AUC | Positivos en el 5 % de mayor riesgo |
|---|---|---|---|---|
| grupo: G1 | 4,006 | 47 | 0,167 | 36 % |
| grupo: G2 | 25,428 | 275 | 0,108 | 43 % |
| tercil_ingresos: bajo | 9,050 | 50 | 0,079 | 46 % |
| tercil_ingresos: medio | 9,049 | 124 | 0,146 | 47 % |
| tercil_ingresos: alto | 9,050 | 134 | 0,123 | 40 % |

Por tipo de evento, la proporción de positivos capturada en el 5 % de mayor riesgo es 60 % para las liquidaciones y 39 % para las reorganizaciones. Con año de admisión exacto es 40 % y con año de apertura 49 %: no hay señal de que la imprecisión de las fechas degrade la medición.

## 9. Sesgo de supervivencia: quién deja de reportar

Muchas sociedades en problemas **dejan de presentar estados** y no vuelven a aparecer. Entre los cierres 2016–2023 (con dos años de seguimiento) el 12,5 % de los positivos dejó de reportar en *t+1* y *t+2*, frente al 7,8 % de los negativos; la tasa de admisión es 2,11 % entre quienes dejan de reportar y 1,26 % entre quienes siguen. Dejar de reportar **no se mezcla en la etiqueta** (no es un evento de insolvencia); aquí solo se describe. Consecuencias: el modelo describe a las sociedades que *reportan*; las que desaparecen sin pasar por un proceso quedan fuera de los positivos, y la sociedad que ya no reporta no tiene puntaje.
Además, en la Fase 0 se midió que solo el 23–37 % de las sociedades admitidas cada año había presentado estados el año anterior: el modelo ve una parte de los procesos, no todos.

## 10. Límites conocidos

- **Etiqueta incompleta antes de 2020:** la base solo conserva los procesos que seguían vivos en dic-2019, así que las admisiones de 2017–2019 están subregistradas (415, 696 y 716 frente a 870–1 190 por año desde 2020). Se entrenó con ellas igualmente (la validación lo prefirió) pero los años de entrenamiento tienen más falsos negativos que la prueba.
- **Año de admisión estimado** en el 5 % de los positivos (reorganizaciones «en ejecución» sin fecha exacta: año del acuerdo menos uno; error de ±1 año en una parte): puede mover un caso entre dos cierres.
- **Cambio de clasificación de la fuente en 2024** (liquidaciones agrupadas) y cortes con columnas distintas: se normalizaron, pero no se pueden auditar uno a uno.
- **Errores de unidades en la fuente** (≈ 0,2 % de los informes): marcados y excluidos de las sumas por sector; sus ratios no se alteran.
- **Probabilidades subestimadas en la cola alta** y calibradas con 2020–2021 (pandemia): conviene recalibrar al reentrenar.
- **Correlación, no causalidad.** Variables como la sección CIIU o el departamento recogen composición de la muestra, no causas.
- **Solo las sociedades que reportan a la Supersociedades:** no cubre bancos, aseguradoras, cooperativas ni microempresas.

## 11. Qué se publica

`gold/alerta_agregada.parquet`: por dimensión (nacional, sección CIIU, división CIIU, departamento y tercil de ingresos), código y año: número de sociedades, probabilidad media, **proporción con perfil alto** (probabilidad calibrada ≥ 0,0355, el percentil 95 de 2020–2021: umbral fijo para poder comparar años), tasa observada de admisión en los 24 meses siguientes (años con etiqueta) y la muestra a la que pertenece cada año (entrenamiento, validación, prueba o sin etiqueta). Grupos de menos de 30 sociedades suprimidos; sin NIT ni puntaje por sociedad; las que ya están en un proceso (estado de la carátula distinto de «ACTIVA») no entran.
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
