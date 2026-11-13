# Fuentes de datos — Radiografía Financiera (Fase 0)

Verificado el **2026-11-12** consultando directamente la API de datos.gov.co (Socrata), los metadatos de cada conjunto y la página de la Supersociedades.
Todo lo que sigue sale de consultas reales; lo que no pude confirmar está marcado **no verificado**. Los scripts están en `notebooks/finanzas/fase0/` (se pueden repetir).
La matriz completa de rubros está en [`matriz_rubros.md`](matriz_rubros.md).

## 1. Resumen ejecutivo

| Tema | Resultado |
|---|---|
| Fuentes del plan (3.1) | **Existen, con las columnas y licencia esperadas** (CC BY-SA 4.0). Datos actualizados el 6–7 de julio de 2026. |
| Pico de 2022 | **No es real**: 32 753 informes (como 2021 y 2023). Las 93 951 «carátulas» son filas repetidas ×3 dentro del mismo informe; el balance y el estado de resultados están repetidos ×2. |
| Unidades de `valor` | **Miles de pesos** (comprobado con Bavaria, Alpina y Postobón). |
| Rubros | Los 8 rubros núcleo tienen ≥ 95 % de cobertura en todos los años, salvo ingresos de Grupo 1 en 2015 (94 %). Los nombres cambian entre años (2017 tiene otra taxonomía, con signo de impuesto invertido). |
| CIIU | **La carátula solo trae CIIU desde el corte 2020.** Para 2016–2019 hay que heredarlo de un año posterior (ver 4). |
| Base de insolvencia | Existe, trae NIT y fecha de admisión; **es una foto de procesos vigentes** (comprobado: el 41 % de los procesos de 2019 ya no figura; ver 6) y no tiene licencia abierta. |
| Eventos unibles por NIT | Entre **128 y 436 eventos por año de corte** (2016–2023); solo **23–37 %** de las empresas admitidas había presentado estados el año anterior. |
| `6cat-2gcs` para conciliar | Sirve, pero con precisión limitada: cifras en **billones con 2 decimales**. |

## 2. Conjuntos de estados financieros (Supersociedades)

Atribución en los metadatos: *Superintendencia de Sociedades*. Licencia: **Creative Commons Attribution Share Alike 4.0** (`CC_40_BY_SA`) en los seis conjuntos. Frecuencia declarada: anual.

| ID | Conjunto | Filas (metadatos) | Datos actualizados | Columnas |
|---|---|---|---|---|
| `6hqw-m3dm` | Carátula | 9 622 096 | 2026-07-06 | 11 comunes |
| `pfdp-zks5` | Estado de situación financiera | 19 638 408 | 2026-07-06 | 11 comunes |
| `prwj-nzxa` | Estado de resultado integral | 8 091 357 | 2026-07-07 | 11 comunes |
| `y3gh-x5g7` | Otro resultado integral | 1 878 008 | 2026-07-07 | 11 comunes |
| `ctcp-462n` | Estado de flujo de efectivo | 6 360 333 | 2026-07-07 | 11 comunes |

Columnas comunes (confirmadas): `codigo_instancia` (número), `nit` (número, **sin dígito de verificación**), `numero_radicado`, `id_punto_entrada`, `punto_entrada`, `id_taxonomia`, `taxonomia`, `fecha_corte` (fecha), `concepto`, `periodo`, `valor` (texto).

Notas:
- **El conteo directo de filas (`count(*)` sobre el conjunto entero) expira** (tiempo de espera de 120 s). Las consultas deben llevar siempre filtro de `fecha_corte` y/o de punto de entrada.
- La API devuelve «�» en lugar de las vocales con tilde y la eñe (confirmado). El carácter reemplaza la letra: se pierde, no se puede recuperar. El mapeo debe quitar el «�» **y** quitar de los patrones las letras acentuadas (así lo hace `12_matriz_rubros.py`).
- «Otro resultado integral» (`y3gh-x5g7`) **no se necesita** para ningún indicador del plan; recomiendo no descargarlo.
- Los estados de fin de ejercicio de cada año tienen `fecha_corte` = 31-dic. Hay informes sueltos con otros cortes (intermedios, y algunos con la fecha del año equivocada); se ignoran.

## 3. Informes por año y grupo

Informes distintos (`codigo_instancia`) con carátula, cierre al 31-dic:

| Corte | Informes | NIT distintos | Plenas (G1) individual | Pymes (G2) individual | Notas |
|---|---|---|---|---|---|
| 2015 | 2 650 | 2 341 | 1 906 | **no existe** | Solo Grupo 1; **no trae flujo de efectivo** |
| 2016 | 24 160 | 23 176 | 2 505 | 17 779 | Primer año con pymes |
| 2017 | 20 884 | 19 821 | 2 421 | 14 682 | Taxonomía distinta (ver 5) |
| 2018 | 20 461 | 19 411 | 2 456 | 14 264 | |
| 2019 | 26 782 | 25 606 | 2 689 | 19 803 | |
| 2020 | 31 284 | 29 944 | 2 695 | 23 311 | |
| 2021 | 30 569 | 29 194 | 2 910 | 23 220 | |
| 2022 | **32 753** | 31 139 | 3 053 | 24 777 | |
| 2023 | 33 139 | 31 393 | 3 148 | 24 800 | |
| 2024 | 30 700 | 29 361 | 3 125 | 22 803 | |
| 2025 | 29 167 | 29 165 | 3 131 | 22 485 | **No trae consolidados ni combinados** (solo 4 puntos de entrada); puede seguir recibiendo informes |

- **No existe Grupo 3** (microempresas) en ningún corte. Solo hay Grupo 1 y Grupo 2.
- Una misma empresa casi nunca presenta dos informes individuales en el mismo año: 0–76 casos por año (≤ 0,3 %). La regla «el de radicado más reciente» alcanza.
- **Individual vs. separado.** Por año hay entre 2 700 y 3 550 NIT (≈ 11–14 %) que **solo** tienen estado separado (sin individual). Son sobre todo controlantes y filiales de grupos. Quedan solo 2–55 NIT por año sin individual ni separado (solo consolidado/combinado).

Los textos del plan (3.2) llaman «carátulas con NIT» a lo que en realidad son **filas** `concepto = NIT`; coinciden con el número de informes en todos los años salvo 2022 (y levemente 2020–2021).

## 4. El pico de 2022 (93 951)

Causa: **duplicación de filas dentro del mismo informe**, no de informes.

- Un informe cualquiera de 2022 (instancia 361459, NIT 800000090) tiene cada fila de la carátula **3 veces** idéntica (mismo `codigo_instancia`, mismo valor).
- En el balance y en el estado de resultados, el periodo actual tiene **56,6 y 24,5 filas por informe** frente a 29,6 y 12,7 en 2021 y 29,2 y 12,7 en 2023: exactamente el doble. El ejemplo revisado tiene 2 filas por (concepto, periodo) con un único valor.
- No son retransmisiones (los radicados por NIT son ≈ 1,0), ni Grupo 3 (no existe), ni informes nuevos (32 753 informes distintos).

**Regla para la Fase 1:** deduplicar siempre por `(codigo_instancia, concepto, periodo)` antes de cualquier otro paso, comprobar que los valores repetidos son iguales (si no lo son, tomar el último y registrarlo) y dejar una prueba que cuente cuántas filas se descartan por año.

## 5. Estructura de los datos que condiciona el mapeo

- **Unidades.** `valor` está en **miles de pesos**. Bavaria & Cía. (860005224) 2024: «Total de activos» = 13 614 435 259 = 13,61 billones de pesos, igual a `6cat-2gcs` (13,61). Alpina: 1 431 184 168 → 1,43. Postobón: 3 380 831 634 → 3,38 (ingresos 2 846 700 531 → 2,85; igual a `6cat-2gcs`).
  La carátula también trae «valor de las utilidades decretadas en miles de pesos», consistente con eso.
- **`periodo`** (corregido en la Fase 1; ver decisiones.md F5).
  - 2016: fechas en texto («2016-dic-31» = actual, «2015-dic-31» = anterior y **«2015-ene-01» = saldo de apertura**, que no es un periodo del estado de resultados), con variantes en inglés («2016-Dec-31», «Jan»).
  - 2017: mezcla de fechas y «Periodo Actual / Periodo Anterior».
  - Resultado y flujo de 2016 y 2017: solo el año («2016» = actual, «2015» = anterior). En el flujo de 2016 la columna trae el NIT (defecto de la fuente).
  - 2018 en adelante: «Periodo Actual» / «Periodo Anterior».
  - Regla: es periodo actual si `periodo` = «Periodo Actual» o su fecha (normalizando meses en español e inglés) coincide con `fecha_corte`.
- **Taxonomías.** `id_taxonomia` cambia cada año (223, 238, 259, 273, 300, 321, 346, 369, 411, 447…); los puntos de entrada también. Hay que localizar el punto individual por **nombre** («Individual», G1 o G2), no por número. La tabla de ids por año está en `notebooks/finanzas/fase0/04_puntos_entrada.py`.
- **2017 es especial.** Etiquetas del balance sin «totales» («Activos», «Pasivos», «Patrimonio», «Activos corrientes»), «Cuentas por pagar comerciales y otras cuentas por pagar» sin «corrientes», impuesto como **«Gasto (ingreso) por impuestos, operaciones continuadas» con el signo invertido** respecto de todos los demás años («Ingreso (gasto) por impuestos») y flujos sin la palabra «netos». También trae una etiqueta de ruido, «Disposiciones actuales».
- **Cuentas por pagar comerciales:** «…otras cuentas por pagar» (2015–2020) y «…otras cuentas por pagar corrientes» (2021–2025).
- **Gastos de venta:** Grupo 2 usa «Gastos de ventas» todos los años salvo 2017 («Costos de distribución»). Grupo 1 usa «Gastos de ventas» en 2015, 2016 y 2018, y «Costos de distribución» en 2017 y desde 2019. Hay que aceptar ambos rótulos en los dos grupos.
- **Obligaciones financieras.** Grupo 1 solo tiene «Otros pasivos financieros corrientes / no corrientes». Grupo 2 además trae «Préstamos corrientes», «Parte corriente de préstamos no corrientes» y «Parte no corriente de préstamos no corrientes». Propuesta: `obligaciones_financieras` = suma de los rubros presentes, y documentar que en Grupo 1 es una aproximación (no se separan los préstamos).
- **Rubro ausente.** Inventarios, costos financieros, gastos de ventas, etc. no aparecen en 25–45 % de los informes. Casi con seguridad significa «no aplica / cero», no «falta el dato»; es un supuesto que hay que declarar y probar (identidad contable) en la Fase 1.
- **Carátula.** Trae CIIU, ciudad, departamento, tipo societario, estado actual, opinión del revisor fiscal y fecha de constitución, además de datos de contacto que **no se descargan** (teléfono, celular, correos, direcciones, dirección y datos de notificación judicial y física). Opiniones del revisor (2024): limpio, con salvedad, negativo y abstención con las etiquetas «03. LIMPIO», «02. CON SALVEDAD», «04. NEGATIVO», «01. ABSTENCIÓN DE OPINIÓN».
- **CIIU: solo desde el corte 2020.** En 2016, 2018 y 2019 la carátula no trae el rótulo «Clasificación Industrial Internacional Uniforme Versión 4 A.C (CIIU)»; solo «Objeto social principal» (texto libre). Desde 2020 sí (con el código y la descripción, p. ej. «L6810 – Actividades inmobiliarias…»).

### Matriz de rubros (resumen)

Cobertura de los informes individuales (detalle por año y alias en [`matriz_rubros.md`](matriz_rubros.md)):

| Variable estándar | G1 (plenas) | G2 (pymes) | Observación |
|---|---|---|---|
| Activo total, activo corriente, pasivo total, pasivo corriente, patrimonio | 99–100 % | 99–100 % | 2017 con otros rótulos |
| Efectivo, ganancias acumuladas | 98–100 % | 99–100 % | |
| Cuentas por cobrar corrientes | 98 % | 97–98 % | |
| Cuentas por pagar comerciales | 98–99 % | 97–98 % | rótulo cambia en 2021 |
| Propiedades, planta y equipo | 92–94 % | 91–93 % | |
| Inventarios corrientes | 75–82 % | 64–74 % | ausente = cero (supuesto) |
| Ingresos de actividades ordinarias | 94–100 % | 100 % | **G1 ronda 95–96 %** |
| Costo de ventas | 85–95 % | 80–86 % | |
| Ganancia bruta | 95–100 % | 100 % | |
| Gastos de administración | 98 % | 97–100 % | |
| Gastos de venta / distribución | 65–76 % | 60–71 % | nombres distintos por grupo |
| Ganancia operacional, antes de impuestos, neta | 100 % | 100 % | |
| Costos financieros | 85–92 % | 72–75 % | |
| Flujo de operación | 97–100 % | 91–100 % | no existe en 2015 |
| Flujo de inversión / financiación | 79–92 % | 65–79 % | |
| Depreciación y amortización (para EBITDA) | 85–92 % | 70–76 % | |

Consecuencias:
- Las **ocho variables núcleo** del plan (activo, pasivo, patrimonio, activo y pasivo corriente, ingresos, ganancia operacional, ganancia neta) están en ≥ 95 % de los informes de todos los años salvo ingresos de G1 en 2015 (94 %), lo que **cumple por muy poco** el criterio de la Fase 1 en G1. Hay que mostrar los informes sin ingresos, no ocultarlos.
- **Obligaciones financieras, días de inventario y cobertura de intereses** se calcularán con los supuestos anteriores y con motivo nulo explícito cuando no haya denominador.
- Una variable que el plan no incluye pero conviene: **depreciación y amortización** (EBITDA), disponible en 70–92 %.

## 6. Base de procesos de insolvencia (Supersociedades)

Fuente: <https://www.supersociedades.gov.co/web/procedimientos-de-insolvencia/informes> («Atlas de insolvencia», archivos «Base Soporte Insolvencia»).

- **Formato:** un Excel por corte (`.xlsx`, 0,3–1 MB). Mensuales desde 2023 (el más reciente: noviembre 2026, publicado el 06-nov-2026, con fecha de generación 2026-11-06); trimestrales o sueltos antes (2019–2022). La página no separa las bases por tipo de proceso.
- **Descargué tres archivos** a `data/finanzas/insolvencia_raw/` (ignorado por git): noviembre 2026 (793 866 bytes), y, con tu autorización, diciembre 2019 (341 815) y diciembre 2022 (452 811).
- **Columnas (19):** `Nro`, `NIT`, `NOMBRE`, `REGIONAL`, `DEPARTAMENTO`, `CIUDAD`, `CIIU`, `MACROSECTOR`, `PROCESO`, `CATEGORIA`, `ACTIVO`, `PASIVO`, `EMPLEOS`, `AÑO_DE_APERTURA_CELEBRACION`, `FECHA AUTO ADMISION`, `FECHA_REORGANIZACION_EN_EJECUCION`, `DOCUMENTO FIRMA ACUERDO`, `NÚMERO AUTO DE ADMISION`, `FECHA DE GENERACIÓN`.
- **Sí trae NIT** (numérico, sin dígito de verificación, mismo formato que los estados) **y fecha de admisión** (`FECHA AUTO ADMISION`, sin nulos, de 2008-06-06 a 2026-10-30).
- **Contenido:** 5 767 filas, 5 765 NIT únicos. `PROCESO`: reorganización en ejecución 3 225, liquidación judicial en trámite 1 454, reorganización en trámite 1 082, liquidación judicial en ejecución 5, y 1 fila con error («COMERCIO»). Hay una fila con la `CATEGORIA` desplazada. `ACTIVO` y `PASIVO` vienen en miles de pesos (misma lógica que los estados) y pueden estar vacíos.
- **Problemas:**
  1. **Es una foto de procesos vigentes, no un historial (comprobado).** Cada archivo trae una sola hoja, «Procesos en Curso». Al compararlos por NIT con el de noviembre de 2026, **ya no están el 41 % de los 2 700 procesos del corte de diciembre de 2019 y el 27 % de los 4 166 de diciembre de 2022** (1 117 y 1 114 procesos). Lo que desaparece son procesos terminados o cerrados. La base actual subestima, por tanto, los eventos de los años antiguos (por eso las admisiones crecen de 4 en 2008 a 957 en 2025).
     - **Se pueden recuperar uniendo cortes:** de los 1 117 procesos que ya no están, 263 son de empresas que habían presentado estados el año previo a su apertura (50 de 2017, 102 de 2018, 108 de 2019). El corte de 2022 aporta otros 304 (aperturas 2017–2022, 65 de 2020, 96 de 2021 y 84 de 2022). Son cifras sin deduplicar entre cortes: indican el orden de magnitud (cientos de eventos más), no un total.
     - **Los cortes antiguos no traen fecha de admisión**: el de 2019 tiene un número de auto (`AUTO_ADMISIÓN`) y el de 2022 solo el año de apertura. Además, en el archivo actual `AÑO_DE_APERTURA_CELEBRACION` no coincide con el año de admisión (p. ej. admisión 2023-06, año 2024: es el año del acuerdo). Para los procesos recuperados solo habrá precisión de año, con error de 1–2 años en reorganizaciones; la etiqueta de 24 meses para ellos será aproximada. Se decide en la Fase 4.
     - Los cortes antiguos incluyen tipos de proceso que el actual no trae («liquidación por adjudicación», «liquidación simplificada», «validación judicial») y **personas naturales comerciantes** (22 y 36 filas «P.N.C.»; su NIT es la cédula). **Las personas naturales no se usan ni se publican.**
  2. Incluye fideicomisos y patrimonios autónomos (NIT que no presentan estados).
  3. Dos NIT repetidos (uno es un duplicado exacto; otro tiene dos admisiones distintas).
- **Licencia / términos: sin licencia abierta.** La página no declara Creative Commons; solo dice que la información proviene de fuentes públicas, que el uso es responsabilidad del usuario y que enlaza a «Términos y condiciones de uso» (**no verificado**: no leí ese documento). Es distinta de la CC BY-SA de los estados. Recomendación: usarla **solo para construir la etiqueta del modelo**, citarla y **no republicar la lista de empresas en proceso**; publicar únicamente agregados.

### Cobertura real del modelo (unión por NIT)

Con la foto de noviembre de 2026. «Etiqueta» = admitida a reorganización o liquidación en los 24 meses siguientes al cierre *t* (1-ene de *t+1* a 31-dic de *t+2*):

| Corte *t* | Empresas con estados | Admisiones en la ventana (toda la base) | **Eventos unidos por NIT** | Tasa | De ellos: reorganización / liquidación |
|---|---|---|---|---|---|
| 2016 | 23 176 | 477 | **128** | 0,55 % | 125 / 3 |
| 2017 | 19 821 | 590 | **152** | 0,77 % | 142 / 10 |
| 2018 | 19 411 | 786 | **219** | 1,13 % | 205 / 14 |
| 2019 | 25 606 | 897 | **277** | 1,08 % | 237 / 40 |
| 2020 | 29 944 | 873 | **229** | 0,76 % | 157 / 72 |
| 2021 | 29 194 | 1 001 | **280** | 0,96 % | 161 / 119 |
| 2022 | 31 139 | 1 348 | **379** | 1,22 % | 227 / 152 |
| 2023 | 31 393 | 1 760 | **436** | 1,39 % | 258 / 178 |

- Entrenamiento con cortes ≤ 2019: **776 eventos**; validación 2020–2021: **509**; prueba 2022: **379** (y 2023 con 436, también con etiqueta completa porque la base llega a octubre de 2026). Tasas ≈ 1 %, como supone el plan.
- Solo **23–37 %** de las admisiones de cada año vienen de empresas que presentaron estados el año anterior (p. ej. 2024: 192 de 803, 24 %). El resto son empresas que no reportan a esa fecha, fideicomisos, o supervisadas por otra entidad. El modelo describe, entonces, a las empresas que **sí reportan**, no a todas las insolventes.
- 2 786 de las 5 767 filas (48 %) coinciden con un NIT que reportó estados en algún corte 2015–2025.
- Antes de 2019 casi todos los eventos son reorganizaciones (3–14 liquidaciones al año); a partir de 2020 las liquidaciones pesan más. Sería razonable evaluar el modelo por tipo.
- El respaldo del plan (cambio de «Estado actual» en la carátula) sirve poco: es un estado **al momento del reporte** (≈ 3 % de los informes ya figura en reorganización), no un evento futuro; no lo recomiendo como etiqueta.

### Cortes adicionales (Fase 4, con aprobación del autor)

Se descargaron 24 cortes más (13 MB; lista y URL en `pipelines/finanzas/insolvencia_cortes.json`, `python -m pipelines.finanzas.descargar_cortes`) para reconstruir el historial de procesos. Lo que se encontró:
- **Solo los cortes de sept. y nov. de 2026 traen fecha de admisión.** El de marzo de 2020 trae la fecha completa dentro de la columna «año de apertura» para los procesos en trámite; el resto, solo el año.
- **El año de la columna significa cosas distintas:** en un proceso «en trámite» y en las liquidaciones es el año de la admisión (coincide en el 98,8 %); en una reorganización «en ejecución» es el del **acuerdo** (la admisión suele ser un año antes: 57–58 % exacto con «acuerdo − 1», 95 % a ±1 año).
- **La clasificación cambia:** de 2020 a 2023 hay liquidación judicial, simplificada y por adjudicación, reorganización abreviada, negociación de emergencia y validación judicial; desde 2024 solo «reorganización» y «liquidación judicial en trámite» (las liquidaciones se agrupan). El evento se define como admisión a reorganización o a cualquier liquidación.
- **Defectos de los archivos:** un año de apertura que Excel guardó con formato de fecha (se lee como 1905: se recupera el número, comprobado contra el corte vecino con 98,7 % de coincidencia), filas con basura en `PROCESO` («COMERCIO», «G5221»), nombres de hoja y de columnas que cambian, un mes que no existe (no hay corte de junio de 2026: se usó mayo) y un archivo idéntico a otro (el listado como «trimestre 1» de 2021 es el de marzo de 2022, comprobado fila por fila; se descartó).
- **Resultado:** 9 877 procesos de 8 251 NIT (69 % con fecha exacta, 24 % con año de apertura, 6 % con acuerdo − 1). Desde 2020 hay entre 870 y 1 190 admisiones al año; **2017, 2018 y 2019 solo 415, 696 y 716**: la base conserva únicamente lo que seguía vivo en dic-2019 (truncamiento por la izquierda).

## 7. `6cat-2gcs` — 10 000 empresas más grandes

- Existe, CC BY-SA 4.0, datos actualizados el 2026-09-16, **50 000 filas** (5 cortes × 10 000: 2021–2025). Formato ancho. La descripción dice: «todas las cifras en este reporte se muestran en **Billones de Pesos**».
- **Los valores vienen como texto con «$» y dos decimales** (p. ej. «$113.92», «$0.18»); el NIT y el año vienen como «890900266.00» y «2024.00». Hay que limpiar.
- Es una lista **multi-supervisor**: 2024 = Supersociedades 8 520, Supertransporte 548, Supersalud 467, Superservicios 210, Supervigilancia 205, Superfinanciera 50. Solo las de **Supersociedades** (8 493 de 8 520) tienen estados en estos conjuntos. Así, **8 497 de las 10 000** se pueden cruzar por NIT.
- **Precisión.** Con dos decimales en billones, el error de redondeo es hasta ±0,005 billones. Para que sea ≤ 1 % hacen falta activos ≥ 0,5 billones (**525** empresas de Supersociedades); ≤ 2 %: 1 016 empresas; ≤ 5 %: 2 218.
  El criterio del plan («mediana del error < 1 %») es inalcanzable sobre las 8 500; propongo medirlo sobre las ≥ 0,5 billones y, para las demás, un error relativo tolerado igual al redondeo.
- **Qué estado financiero usa no está documentado.** Bavaria: activos coinciden con el estado **separado** (13,61), pero ingresos no (6cat: 8,62; separado: 6,92). Alpina: activos coinciden (1,43), los ingresos de 6cat (2,18) son iguales al **periodo anterior** (2,180) y no al actual (2,098). Postobón coincide en ambos. O sea: la conciliación de activos y patrimonio es confiable; la de ingresos puede diferir por definición («ingresos operacionales» de SIRFIN) y hay que investigarla en la Fase 1.

## 8. Otras fuentes (verificadas en la Fase 3, 2026-11-13)

- **IPC del DANE:** no está en datos.gov.co (se buscó en su catálogo). Se usa el anexo «Índices - Serie de empalme» del DANE (`https://www.dane.gov.co/files/operaciones/IPC/oct2026/anex-IPC-Indices-oct2026.xlsx`, 40 KB, actualizado el 9-nov-2026): índice mensual total nacional 2003–oct 2026, base diciembre 2018 = 100. Las variaciones de diciembre a diciembre que salen del archivo (2017: 4,09 %, 2018: 3,18 %, 2019: 3,80 %, 2020: 1,61 %, 2021: 5,62 %, 2022: 13,12 %, 2023: 9,28 %, 2024: 5,20 %, 2025: 5,10 %) coinciden con las oficiales. Se guarda por año (diciembre y promedio de los 12 meses) en `pipelines/finanzas/referencia/ipc_anual.csv`; solo se incluyen años con los 12 meses. **Cada enero hay que agregar el año nuevo** (`python -m pipelines.finanzas.catalogos <ipc.xlsx> <ciiu.xlsx>`); las validaciones fallan si falta el IPC de un año procesado.
- **CIIU Rev. 4 A.C. (actualización 2022):** `https://www.dane.gov.co/files/sen/nomenclatura/ciiu/Estructura-detallada-CIIU-4AC-2022.xlsx` (103 KB). 21 secciones, 88 divisiones, 246 grupos y 502 clases, en `pipelines/finanzas/referencia/ciiu_rev4ac.csv`. La actualización 2022 subdividió algunas clases que las sociedades siguen reportando con el código anterior (7110, 1030, 3210, 8890: 1,3 % de las sociedades-año): para esas se usa el nombre del grupo. **Aviso:** el DANE indica que la **CIIU Rev. 5 A.C. es la clasificación vigente (Resolución 992 de 2026)**; la carátula de los estados sigue declarando «Versión 4 A.C.». Si la Supersociedades cambia a Rev. 5, los códigos del CIIU de la carátula cambiarán y habrá que revisar el catálogo.
- **DIVIPOLA** (`gdxc-w37w`): ya usada en el observatorio; la carátula trae ciudad y departamento como texto sucio (ver decisiones.md F5), que se resuelven por nombre dentro del departamento (96,7 % de las sociedades-año).

## 9. Pares: tamaño de los grupos (corte 2024, informes individuales)

- 25 928 informes individuales con CIIU; **441 códigos CIIU-4** y 87 CIIU-2.
- Para que cada tercil tenga ≥ 15 empresas hacen falta ≥ 45 por CIIU-4: eso lo cumplen **114 códigos, que cubren el 85,4 % de las empresas**. El 14,6 % restante pasaría a CIIU-2 (98,5 % de cobertura con ≥ 45).
- El código más grande es **L6810 (actividades inmobiliarias con bienes propios o arrendados): 3 614 empresas = 14 %** de todas. Es un grupo heterogéneo (tenedoras de inmuebles, sociedades familiares) y conviene mirarlo aparte.

## 10. Recomendación de alcance

1. **Cortes 2016–2025.** El 2015 se descarta (solo Grupo 1, 2 341 NIT, sin flujo de efectivo).
2. **Estados individuales de Grupo 1 y Grupo 2**; **separado solo cuando la sociedad no tenga individual**, marcado en la ficha («estado separado»). Consolidados y combinados fuera.
3. **Descargar solo rubros necesarios**, solo el periodo actual (el anterior solo para validar reexpresiones) y solo los puntos de entrada individual/separado. Estimación: ≈ 0,9 millones de filas/año en el balance, ≈ 0,4 en resultados y ≈ 0,5 en flujo, ya deduplicadas: del orden de 15–20 millones de filas en total; bronze en Parquet < 300 MB. Cada consulta con filtro por año y punto de entrada.
4. **No descargar «Otro resultado integral».**
5. **CIIU:** tomar el del corte 2020–2025 más cercano al año (preferir el siguiente, y el anterior si no hay) para 2016–2019; marcar el origen. Para 2016–2019 la fiabilidad depende de que la actividad principal no haya cambiado.
6. **Modelo de alerta:** la base actual subestima los años antiguos (comprobado). En la Fase 4 hay que reconstruir el historial uniendo los cortes (los trimestrales de 2019–2022 y los mensuales desde 2023) con clave NIT y quedándose con la primera aparición; los procesos recuperados solo tienen año de apertura. Aun así, es prudente validar con cortes recientes (p. ej. entrenar 2018–2021, validar 2022, probar 2023). Descargar más cortes es una acción que se pedirá en su momento.
7. **Publicar solo agregados** del modelo y de la base de insolvencia.

## 11. Lo que no pude verificar

- Los términos de uso completos de la Supersociedades para la base de insolvencia.
- Cuántos eventos totales aporta la unión de todos los cortes (solo medí dos cortes, sin deduplicar entre ellos).
- Qué definición usa `6cat-2gcs` para «ingresos operacionales» ni de qué estado (separado, individual) toma las cifras.
- Valores de IPC y CIIU-nombres del DANE.
- Si la duplicación ×2 y ×3 de 2022 también afecta al estado de flujo de efectivo y a «Otro resultado integral» (no lo medí; la regla de deduplicar por `(codigo_instancia, concepto, periodo)` lo cubre igual).
