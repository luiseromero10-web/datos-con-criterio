# Registro de decisiones — Radiografía Financiera

## 2026-11-12 · F1 · Fase 0: verificación de fuentes (sin cambios hacia afuera)
Detalle en [`fuentes.md`](fuentes.md) y [`matriz_rubros.md`](matriz_rubros.md). Scripts en `notebooks/finanzas/fase0/`.
- Se crearon las subcarpetas de la sección 7 del plan (`apps/finanzas`, `pipelines/finanzas`, `models/finanzas`, `tests/finanzas`, `notebooks/finanzas`, `docs/finanzas`, `data/finanzas`). El observatorio, `packages/*` y `pipelines/common` no se tocaron.
- Servicios: conectados GitHub (CLI `gh` con sesión del autor), Vercel (conector; la escritura puede dar 403, se usará la CLI con confirmación), Supabase y Claude Docs. **Cloudflare necesita autenticación** (`needs_auth`); para R2 se seguirá usando Wrangler/CLI con la sesión del autor. No se hizo nada hacia afuera.
- Se descargaron **tres** archivos de la Supersociedades (base de insolvencia: noviembre 2026, 793 866 bytes; y, con autorización del autor, diciembre 2019 y diciembre 2022) a `data/finanzas/insolvencia_raw/` (ignorado por git).

## 2026-11-12 · F2 · Hallazgos que cambian el plan
1. **El pico de 2022 es duplicación de filas**, no de informes (32 753 informes reales). Toda la ingesta deduplica por `(codigo_instancia, concepto, periodo)` y registra los descartes. El plan 3.2 cita «93 951 informes»; el dato correcto es 32 753.
2. **Unidades: miles de pesos.** Se guardarán en pesos (×1 000) o se dejarán en miles con la unidad en el nombre de columna; decisión de formato pendiente para la Fase 1 (propuesta: pesos enteros).
3. **CIIU solo existe en la carátula desde el corte 2020.** Los pares de 2016–2019 dependen de heredar el CIIU de otro año.
4. **La base de insolvencia es una foto de procesos vigentes** (comprobado con los cortes de diciembre 2019 y 2022: ya no figuran el 41 % y el 27 % de sus procesos) y **no tiene licencia abierta**. Uniendo cortes se recuperan cientos de eventos con estados; los cortes antiguos solo traen el año de apertura, no la fecha de admisión.
5. **`6cat-2gcs` tiene precisión de 0,01 billones**; el criterio «mediana del error < 1 %» del plan solo se puede medir con las 525 empresas de ≥ 0,5 billones de activos.
6. **No hay Grupo 3** y 2015 solo trae Grupo 1 sin flujo de efectivo.
7. **El signo del impuesto está invertido en 2017** («Gasto (ingreso) por impuestos»).

## 2026-11-12 · F3 · Decisiones de la sección 0.3 (**confirmadas por el autor el 2026-11-12**)
Las cinco decisiones de 0.3 y las nuevas (6–10) se aprobaron tal como se proponían. En el punto 5 el autor aún debe elegir el libro y el marco del caso (no se necesita hasta la Fase 7).
1. **Nombre visible:** «Radiografía Financiera»; ruta `/finanzas`.
2. **Puntajes individuales del modelo:** no publicarlos (ver 0.2 del plan). Además, solo 23–37 % de las empresas admitidas había presentado estados el año anterior, lo que refuerza que el modelo no es una calificación de ninguna empresa en particular.
3. **Alcance:** 2016–2025; estados individuales de Grupo 1 y 2; separado solo si no hay individual (≈ 11–14 % de las sociedades); consolidados y combinados fuera.
4. **Pares:** CIIU-4 × tercil de ingresos si el CIIU-4 tiene ≥ 45 empresas (114 códigos, 85 % de las empresas); si no, CIIU-2. Se propone **subir el mínimo de 15 por grupo** a 15 por *tercil* (45 por CIIU-4). El código L6810 (14 % de las empresas) se trata con atención.
5. **Libro y marco del caso:** los elige el autor.

Decisiones nuevas que surgieron (también confirmadas):
6. **Base de insolvencia:** usarla solo para construir la etiqueta y publicar solo agregados, sin listar empresas en proceso.
7. **Comprobación de la foto de procesos vigentes:** autorizada y hecha. Se descargaron los cortes de diciembre 2019 y diciembre 2022 (ver fuentes.md, sección 6). Hipótesis confirmada. Quedan descargas adicionales de cortes para la Fase 4, que se pedirán entonces.
8. **CIIU 2016–2019:** heredar del año más cercano con CIIU, marcando el origen.
9. **Separado como respaldo** se marca en la ficha.
10. **Conciliación con `6cat-2gcs`:** medir el error sobre las empresas de ≥ 0,5 billones y reportar aparte las demás.

## 2026-11-12 · F4 · Cierre de la Fase 0
El autor confirmó alcance, pares, política de publicación del modelo (sin puntajes individuales) y el uso de la base de insolvencia solo como etiqueta y en agregados. La Fase 0 queda cerrada; se continúa con la Fase 1 cuando el autor lo pida.

## 2026-11-12 · F5 · Fase 1: ingesta y transformación local (hecha)
**Entregado:** `pipelines/finanzas/{config,conceptos,ingesta,transformar,calidad}.py`, `tests/finanzas/` (36 pruebas) y [`calidad_fase1.md`](calidad_fase1.md), generado por `python -m pipelines.finanzas.calidad` (sale con código 1 si algún criterio falla).
Ejecución: `python -m pipelines.finanzas.ingesta` (10 cortes, ~12 min, ~150 MB de bronze), `python -m pipelines.finanzas.transformar` (~30 s), `python -m pipelines.finanzas.calidad`. Resultado: **268 022 estados** (sociedad × año) en `gold/estados.parquet` (35 MB), 44 326 sociedades, bronze 152 MB, silver 46 MB, gold 39 MB.

**Diseño:**
- Bronze por conjunto y año, solo informes individuales y separados de la taxonomía principal del corte, solo los rubros del mapeo y, de la carátula, **una lista blanca de 11 campos**: los datos de contacto no se piden a la API (la prueba `test_el_filtro_de_la_caratula_es_una_lista_blanca_sin_contacto` y `calidad.py` lo comprueban).
- No se usó `pipelines.common.socrata.fetch_all`: guarda todas las filas en memoria y un año de balance son ~1 millón. `ingesta.py` pagina y libera cada página (no se modificó lo compartido). Se vuelve a descargar solo si `rowsUpdatedAt` de un conjunto cambió.
- El criterio de elección de informe es: con balance, individual sobre separado, radicado más reciente, `codigo_instancia` más alto. Descarta 0–93 informes por año (todos por tener otro de la misma sociedad y año o por no traer balance).
- `valor` pasa de miles a **pesos enteros** (×1 000), decisión pendiente de F2 resuelta. Rubro ausente = `NULL` en silver y gold; el tratamiento «ausente = cero» queda para la Fase 3.
- Un rubro puede tener varios alias (taxonomía distinta por año); el signo del impuesto de 2017 se corrige al leer.

**Hallazgos nuevos (corrigen o completan la Fase 0):**
1. **Periodo en 2016–2017:** el resultado y el flujo escriben el periodo como solo el año («2016»), no «Periodo Actual». La regla exacta del periodo actual es: «Periodo Actual», «AAAA», «AAAA-dic-31», «AAAA-Dec-31» o «AAAA-12-31».
2. **Flujo de efectivo de 2016:** la fuente puso el **NIT en la columna `periodo`** y en el 29 % de los informes trae dos valores (actual y anterior) imposibles de distinguir. Se **excluye todo el flujo de 2016**: `flujo_operacion`, `flujo_inversion`, `flujo_financiacion` y `depreciacion_amortizacion` quedan vacíos ese año.
3. **921 informes de 2020 no tienen balance en la fuente** (la API no devuelve ninguna fila para ellos): el 97,1 % de los informes de 2020 trae balance, el 100 % en los demás años. Quedan en el gold con solo el resultado.
4. **`6cat-2gcs` suma ingresos distinto:** su «ingresos operacionales» se parece a ingresos ordinarios **+ otros ingresos** (mediana del error 0,5–0,6 %) y no a los ordinarios solos (1,6–1,8 %). Por eso se agregó la variable `otros_ingresos`. Los casos con más de 5 % se concentran en estados separados (23 % de los separados frente a 7 % de los individuales), casi siempre con 6cat mayor: hipótesis, sin verificar, de que 6cat informa un perímetro de grupo para ingresos.
5. **CIIU:** 100 % desde 2020; antes se hereda. Heredado cubre 76,5 % de las sociedades de 2016, 85 % de 2017, 93 % de 2018 y 96 % de 2019. **El 23,5 % de las sociedades de 2016 no tiene CIIU** (dejaron de reportar antes de 2020). Son justo las empresas más expuestas al sesgo de supervivencia; en la Fase 4 hay que decidir si entran al modelo con sector «desconocido».
6. **Ciudad y departamento** vienen sucios (sin tilde, con «�», con sufijo de departamento, guion como espacio, abreviados). Se resuelven al código DIVIPOLA por nombre dentro del departamento, solo con coincidencia única: 96,7 % de las sociedades-año, 98,3 % en 2024. Lo no resuelto queda vacío.
7. **La razón social conserva «?»** donde la fuente dañó una letra (no se puede restaurar). Alternativa a evaluar en la Fase 5: tomar el nombre de `6cat-2gcs` o de la base de insolvencia cuando exista.
8. **El plan (sección 8) pide «silver y gold de estados e indicadores» en la Fase 1**, pero la Fase 3 contiene «Indicadores de 4.3». Se interpretó que los indicadores son de la Fase 3; la Fase 1 deja estados, identidad y calidad.

**Resultado de los criterios de aceptación** (detalle en `calidad_fase1.md`):
- Conciliación con `6cat-2gcs` (empresas de Supersociedades con activos ≥ 0,5 billones, 2021–2025): activos 0,2 % de error mediano y **0 casos > 5 %**; patrimonio 0,2 % y 1 caso > 5 %; ingresos ordinarios + otros 0,5–0,6 % (68–83 casos > 5 % por año, explicados arriba solo como hipótesis).
- Las 8 variables núcleo en ≥ 95,9 % de los informes individuales de cada año (el mínimo es 2020 por los 921 sin balance).
- Identidad activo = pasivo + patrimonio: 100 % en todos los años (±3 000 pesos).
- Sin datos de contacto en bronze, silver ni gold.
- Los NIT con estado individual coinciden con los de la Fase 0 (diferencias de 0 a 4 por informes repetidos).

## 2026-11-12 · F6 · Fase 2: calidad y automatización (código listo y probado en local; falta ejecutarlo en Actions)
**Entregado:** `pipelines/finanzas/{validaciones,publicar,revisar,referencias}.py`, `.github/workflows/ingesta-finanzas.yml`, 30 pruebas nuevas (66 en `tests/finanzas`).
- **Validaciones (pandera) por capa**, con salida 1 y `data/finanzas/validacion_reporte.md` si algo falla:
  bronze (archivos y columnas, volumen, `valor` numérico, carátula dentro de la lista blanca); silver (un informe elegido por sociedad y año, variables conocidas, sin repetidos); gold (esquema con activos y pasivos ≥ 0 y nada sobre 1e15 pesos, volumen de sociedades contra el año anterior ±35 %, cada año presente, coherencia silver/gold, núcleo ≥ 95 %, identidad ≥ 99 %, conciliación de activos con `6cat-2gcs` ≤ 1 % de error mediano y sin datos de contacto). Los valores extremos de la fuente (ingreso o flujo más de 10 veces el activo) quedan como **advertencia**, no bloquean: pueden ser reales en comercializadoras.
- Probadas contra datos reales adulterados en una copia: un activo negativo, un año eliminado, un descuadre contable en el 5 % de las filas, un campo de contacto en bronze y un archivo de bronze faltante. Las cinco se detectan; los datos intactos pasan.
- **Publicación sin dejar nada a medias** (`publicar.py`): todo sube primero a `finanzas/staging/<corrida>/`, se comprueba el tamaño de cada archivo, solo entonces se copia en el servidor a `finanzas/gold/` y por último se escribe `metadatos.json` (versión, años, filas, sha256 y tamaño de cada archivo, fecha de actualización de cada fuente, métricas de calidad, licencia CC BY-SA 4.0, atribución y aviso). Si algo falla antes de copiar, `gold/` queda intacto y no queda basura en staging (probado con un cliente S3 falso). Sin credenciales corre en simulación.
- **Revisión mensual** (`revisar.py`): el flujo programado (día 1 de cada mes, 12:00 UTC) compara `rowsUpdatedAt` de cada conjunto con el de `finanzas/gold/metadatos.json` y solo reconstruye si cambió; una ejecución manual siempre reconstruye. La reconstrucción reutiliza el bronze en la caché de Actions y solo vuelve a descargar los conjuntos que cambiaron.
- **Cortes automáticos:** los años a procesar van de 2016 al año anterior al actual (`config.anios()`); un corte nuevo entra solo cuando ya tiene el 60 % de los informes del anterior (`MIN_COMPLETITUD`), así un corte recién abierto no baja el volumen ni dispara la validación.
- **Alertas:** si cualquier paso falla se abre un issue con el reporte de validación; la publicación va después de validar, así que no corre.
- **Referencia propia de DIVIPOLA:** `data/finanzas/ref/divipola.parquet` (antes se leía de `data/ref`, que es del observatorio) se genera con `pipelines.common.divipola`; nada compartido se modificó.
- **Observación:** `gh secret list` solo muestra `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` y `R2_BUCKET`; **`SOCRATA_APP_TOKEN` no aparece** entre los secretos del repositorio. El flujo funciona sin él (la descarga local de ~12 min se hizo sin límites), pero con él la API limita menos las peticiones.

## 2026-11-12 · F7 · Fase 2: corrida manual en Actions y publicación en R2 (hecha, con aprobación del autor)
**Corrida** [43360620946](https://github.com/luiseromero10-web/datos-con-criterio/actions/runs/43360620946) (`workflow_dispatch`, commit `2366c6e`): `revisar` y `ingesta` en verde; descarga desde cero de los 10 cortes (40 descargas), transformación, validación («Validaciones OK», mismas 5 advertencias que en local) y publicación. Sin `SOCRATA_APP_TOKEN` (no existe como secreto) la descarga funcionó igual.
**Verificado en R2 por la URL pública** (`https://pub-9d9d9ff84f4e49209f1c0cdfdaaaf366.r2.dev/finanzas/gold/…`):
- `estados.parquet` 35 411 365 bytes, `empresas_anio.parquet` 4 351 828, `empresas.parquet` 927 429 y `metadatos.json` 1 896: **los tamaños son idénticos a los de la construcción local** (el proceso es reproducible).
- Tipos de contenido correctos (`application/vnd.apache.parquet`, `application/json`), `Cache-Control: public, max-age=300`, **lectura por rangos con HTTP 206** y `Access-Control-Allow-Origin: *`: DuckDB lee el parquet directamente desde R2 (268 022 sociedades-año, 44 326 NIT, 2016–2025; Bavaria 2024: activo 13 614 435 259 000 e ingresos 6 923 194 639 000 pesos, igual que local).
- `finanzas/staging/` quedó vacío (la limpieza funcionó).
- `metadatos.json`: corrida, commit, años, filas, tamaño y sha256 de cada archivo, fecha de actualización de las cinco fuentes, métricas (núcleo mínimo 95,9 %, identidad mínima 100 %, error mediano de activos máximo 0,22 %), licencia CC BY-SA 4.0 y atribución.
**La corrida con `forzar_fallo=true` se hizo después, con aprobación del autor (F8).** Aviso de Actions sin atender: las acciones `checkout`, `setup-uv` y `cache` anuncian que Node 20 queda en desuso.

## 2026-11-12 · F8 · Fase 2: corrida con fallo forzado (hecha, con aprobación del autor)
**Corrida** [43366050525](https://github.com/luiseromero10-web/datos-con-criterio/actions/runs/43366050525) con `forzar_fallo=true`: `revisar` en verde; en `ingesta`, descarga (reutilizó la caché), transformación OK, **«Validar» falló, «Publicar a R2» se omitió** y «Abrir issue si algo falló» se ejecutó. Se creó el issue [#4](https://github.com/luiseromero10-web/datos-con-criterio/issues/4) con el reporte de validación («Fallo forzado (FORZAR_FALLO=1) para probar el flujo de alerta.»).
**R2 no cambió:** `finanzas/gold/metadatos.json` sigue con `generado` 2026-11-13T03:59:41 (corrida 43360620946) y no hay nada en `finanzas/staging/`.
El issue #4 es de prueba y se puede cerrar. El #3 («Ingesta fallida 2026-11-12») es anterior y del observatorio; no se tocó.
**Criterios de aceptación de la Fase 2:** cumplidos (corrida manual deja gold en R2; una validación forzada a fallar abre un issue y no publica).
