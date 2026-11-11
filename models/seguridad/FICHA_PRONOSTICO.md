# Ficha del modelo — Pronóstico semanal de delitos

Versión de esta ficha: 2026-11-11. Las cifras salen de `artifacts/metrics.json` y se actualizan con el entrenamiento mensual.

## Qué predice
Conteo de hechos denunciados por **semana** (lunes a domingo), para 16 semanas desde la última semana confiable, con intervalo del 80 % (p10 y p90).
Seis delitos: homicidio, lesiones personales, hurto a personas, a comercio, a residencias y a vehículos.
Dos niveles: **departamental** (los 33, siempre) y **municipal** (solo las series con media de al menos 2 hechos por semana: 415 series, de 19 en homicidio a 123 en hurto a personas).
Los 16 pasos cubren las 8 semanas provisionales (se pueden comparar con lo ya observado) y llegan hasta unas 7 semanas de futuro real.

## Datos
SIEDCO publicado en datos.gov.co por MinDefensa (familia "Observatorio MDN"), 2018-01 a 2026-09, y población DANE (CNPV 2018). Detalle en `docs/fuentes.md`.
Se entrena hasta la **2026-07-27**: se descartan las últimas 8 semanas por registro tardío (supuesto; ver más abajo).

## Método vigente
**TSB** (Teunter-Syntetos-Babai), un modelo clásico de demanda intermitente: estima por separado la probabilidad de que haya hechos y su tamaño, con suavizado exponencial.
Se eligió automáticamente entre AutoETS, AutoTheta, TSB, LightGBM y el promedio de los cuatro, por menor WAPE en los cortes 1 a 6 del backtest.
Las líneas base son estacional de 52 semanas y media móvil de 4 semanas.

**Consecuencia que conviene saber:** el pronóstico de TSB es un **nivel plano** durante las 16 semanas. No captura estacionalidad ni festivos.
LightGBM sí los usa, pero no ganó. La elección se repite cada mes y puede cambiar.

## Evaluación
Backtest con **origen rodante**: 12 cortes (del 2024-07-29 al 2026-04-06), horizonte de 16 semanas, paso de 8. No hay validación aleatoria.
Para no medir con lo mismo que se usó para elegir, el método y los intervalos se calibran con los cortes 1 a 6 y los resultados de abajo son de los cortes 7 a 12.

| Método | WAPE | MASE |
|---|---|---|
| Estacional 52 semanas (base) | 0,302 | 1,058 |
| Media móvil 4 semanas (base) | 0,261 | 0,846 |
| AutoETS | 0,265 | 0,813 |
| AutoTheta | 0,255 | 0,806 |
| LightGBM | 0,259 | 0,828 |
| Promedio de los cuatro | 0,247 | 0,796 |
| **TSB (vigente)** | **0,241** | 0,801 |

**Frente a la mejor línea base: 7,7 % menos de error en WAPE.** Mejora en los 6 delitos, pero la ganancia es modesta y desigual:

| Delito | WAPE vigente | WAPE mejor base | Mejora |
|---|---|---|---|
| Hurto a personas | 0,223 | 0,247 | 10,0 % |
| Hurto a vehículos | 0,234 | 0,258 | 9,4 % |
| Hurto a residencias | 0,284 | 0,306 | 7,2 % |
| Lesiones | 0,237 | 0,245 | 3,2 % |
| Homicidio | 0,328 | 0,338 | 2,9 % |
| Hurto a comercio | 0,415 | 0,422 | 1,7 % |

Por horizonte: semanas 1-8, WAPE 0,229 (7,9 % mejor que la base); semanas 9-16, 0,253 (7,6 % mejor).
Cobertura del intervalo del 80 %: 0,792 en las semanas 1-8 y 0,779 en las 9-16. Entre grupos va de 0,73 a 0,81, así que la calibración es buena pero no exacta.

## Intervalos
Conformales sobre los residuos del backtest, normalizados como (real − pronóstico) / √(pronóstico + 1), por delito, nivel y tramo de horizonte. Producción: se recalibran con los 12 cortes.

## Límites y sesgos
- **Subregistro.** Los datos son denuncias, no delitos reales. Un cambio en la propensión a denunciar parece un cambio en el delito.
- **Registro tardío.** Las semanas recientes se completan después. Con una comparación entre dos extracciones (DIJIN del 31-ago y MDN del 21-oct) para hurto de vehículos faltaba cerca del 10 % en semanas de unas 5 semanas de antigüedad. No es una medición limpia: son conjuntos con definiciones algo distintas. Las 8 semanas provisionales son un supuesto, no un resultado.
- **Cambios de criterio de registro.** Hay quiebres de nivel en hurto a comercio y residencias (2016-2017). Por eso se parte de 2018. Si hubiera otro, el modelo lo trataría como cambio real.
- **Series intermitentes.** En municipios pequeños la mayoría de las semanas es cero; el pronóstico es una tasa esperada, no una predicción de cuándo ocurrirá un hecho.
- **Evaluación algo optimista.** Al comparar alternativas se miraron también los cortes 7 a 12, así que la mejora de 7,7 % puede estar levemente inflada. Cada entrenamiento mensual vuelve a medirla con datos nuevos.
- **Choques.** Nada en el modelo anticipa cambios de política, pandemias, o eventos extraordinarios.

## Uso indebido
- No sirve para **señalar municipios** como "peligrosos": compare tasas por 100 000 habitantes y use los intervalos, no un valor puntual.
- No es una estimación **causal**: no dice qué pasaría con más o menos vigilancia.
- No usar un municipio con pocos hechos para decisiones individuales: el intervalo es muy ancho en proporción.
- No sustituye el criterio de las autoridades locales ni la información de contexto.
