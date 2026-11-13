# Plan de implementación — App 2: Radiografía Financiera de Empresas

**Sitio:** *Datos con Criterio*, de Luis E. Romero. Esta app es una **zona** más de la plataforma (ver `PLAN_PLATAFORMA.md`): proyecto de Vercel propio (`dcc-finanzas`), servida bajo `/finanzas` a través del portal.
**Formato del caso:** Libro → Marco → Datos → Hallazgo → Recomendación (el libro y el marco los elige el autor; ver 0.3).
**Estado del plan:** propuesta del 2026-11-12, con fuentes verificadas en datos.gov.co ese día (sección 3). Las decisiones marcadas **[CONFIRMAR]** se validan con el autor en la Fase 0.

---

## 0. Resumen para el autor

### 0.1 Qué hace

Una herramienta que responde, con los estados financieros que las sociedades reportan a la Supersociedades, preguntas de nivel directivo:

1. **«¿Cómo está esta empresa?»** — buscador por NIT o razón social y una **ficha** con diez años de ingresos, márgenes, rentabilidad, liquidez, endeudamiento y ciclo de caja.
2. **«¿Cómo está frente a sus pares?»** — cada indicador en **percentil** frente a empresas del mismo sector (CIIU) y tamaño, con una **araña** empresa contra mediana del sector (el mismo lenguaje visual del observatorio).
3. **«¿Quién lo hace mejor?»** — **comparar dos empresas** lado a lado (dos arañas, tabla y lectura en palabras).
4. **«¿Cómo está mi sector?»** — vista de sector: mediana y dispersión de cada indicador por año, crecimiento real, quién crece rentable.
5. **«¿Dónde hay señales de deterioro?»** — señales objetivas (patrimonio negativo, pérdidas seguidas, opinión del revisor fiscal distinta de «limpio», liquidez bajo 1) y, a nivel agregado, un **modelo de alerta temprana de insolvencia** con *backtest* (ver 0.2).

**Éxito =** sitio público con la ficha de ~30 000 sociedades por año (2016–2025), indicadores comparables entre taxonomías, actualización automática cuando Supersociedades publique un nuevo corte, un modelo de alerta evaluado honestamente y un artículo de análisis.

### 0.2 Lo que recomiendo con criterio (y por qué)

- **No publicar una «probabilidad de quiebra» con nombre propio** en la ficha de cada empresa. **[CONFIRMAR]**
  Un puntaje individual de un modelo puede dañar a una empresa real, se lee como calificación crediticia y no lo es, y expone al autor a reclamos. Propuesta:
  - En la ficha: solo **hechos y comparaciones** (indicadores, percentiles, señales objetivas redactadas en neutro, opinión del revisor fiscal tal como fue reportada).
  - El modelo de alerta se usa **agregado** (por sector, región y tamaño: «qué proporción de empresas del sector muestra perfil de riesgo») y en el **artículo**, donde se explica qué lo predice y con qué error.
  - Si el autor quiere puntajes individuales, hacerlo después de una revisión legal y con aviso explícito.
- **Sin datos de contacto.** La carátula trae teléfono, celular, correo y direcciones de notificación. **Nunca** pasan de la capa *bronze*; no se publican aunque sean públicos.
- **Aviso permanente:** «Información reportada por las sociedades a la Supersociedades. No es asesoría financiera ni calificación de riesgo».
- **Valores en pesos constantes** para hablar de crecimiento (deflactar con el IPC del DANE); en pesos corrientes para niveles del año.

### 0.3 Decisiones que el autor valida en la Fase 0

1. Nombre visible de la app (propuesta: «Radiografía Financiera»; ruta `/finanzas`, carpeta `finanzas`).
2. Publicación de puntajes individuales del modelo (recomendación: no; ver 0.2).
3. Alcance: estados **individuales** de Grupo 1 (NIIF plenas) y Grupo 2 (NIIF pymes); separados solo cuando no haya individual; consolidados fuera del MVP.
4. Definición de **pares**: CIIU a 4 dígitos con respaldo a 2 dígitos si hay menos de 15 empresas, y tamaño por terciles de ingresos dentro del sector (no la clasificación legal de tamaño por UVT, más compleja).
5. Libro y marco del caso (p. ej., un libro de finanzas para directivos o de estrategia). No se inventa: lo elige el autor.

## 1. Independencia respecto a la app actual

La app vive en **subcarpetas propias** y no modifica nada del observatorio. Lo compartido se usa tal cual.

| Pieza | Observatorio (no se toca) | Esta app (nuevo) |
|---|---|---|
| Sitio | `apps/seguridad` | `apps/finanzas` (Next.js, `basePath: "/finanzas"`) |
| Proyecto de Vercel | `dcc-seguridad` | `dcc-finanzas` |
| Ingesta | `pipelines/seguridad` | `pipelines/finanzas` |
| Modelos | `models/seguridad` | `models/finanzas` |
| Pruebas Python | `tests/*.py` | `tests/finanzas/` |
| Exploración | `notebooks/` | `notebooks/finanzas/` |
| Documentos | `docs/fuentes.md`, `docs/decisiones.md` | `docs/finanzas/fuentes.md`, `docs/finanzas/decisiones.md`, `docs/finanzas/metodologia.md` |
| Datos locales | `data/` | `data/finanzas/` (ignorado por git) |
| Datos publicados (R2) | `gold/` | `finanzas/gold/` (mismo bucket, prefijo propio) |
| Flujo programado | `.github/workflows/ingesta.yml` | `.github/workflows/ingesta-finanzas.yml` |

**Compartido sin modificar:** `packages/marca` (identidad), `packages/comunidad` (comentarios, feedback, eventos, artículos relacionados), `pipelines/common` (cliente Socrata, R2, DIVIPOLA).
Si hiciera falta cambiar algo compartido, se propone primero y se corre la batería completa de pruebas de ambas apps.

**Cambios mínimos fuera de las subcarpetas** (cada uno con confirmación, en la Fase 6):
- `package.json` (script `dev:finanzas`), CI (`app: [portal, seguridad, finanzas]`), `pyproject.toml` solo si hace falta una dependencia nueva.
- Portal: una regla de `rewrites` para `/finanzas` (variable `ZONA_FINANZAS_URL`), la tarjeta del caso en la portada y `"finanzas"` en `APPS_VALIDAS` de los artículos.
- Función `dcc-comunidad`: agregar `"finanzas"` a `APPS` y los eventos nuevos a la lista blanca. Exige **redesplegar la función** (versión 3) en `romi-app`. La base no cambia: sus columnas `app` ya aceptan cualquier identificador.

## 2. Alcance

**Dentro (MVP):**
- Sociedades vigiladas o que reportan a la Supersociedades; estados de fin de ejercicio (31 de diciembre), cortes **2016–2025** (2015 tiene muy pocas empresas; ver 3.2).
- Estados individuales de Grupo 1 y Grupo 2; separados como respaldo.
- Estado de situación financiera, estado de resultados y flujo de efectivo; carátula para identidad, sector, ubicación, estado y opinión del revisor fiscal.

**Fuera (fases posteriores):**
- Bancos, aseguradoras y fiduciarias (las vigila la Superfinanciera; no hay un conjunto equivalente en datos.gov.co).
- EPS (Supersalud), cooperativas (Supersolidaria), sector público.
- Estados consolidados y combinados; cortes intermedios (trimestrales).
- Grupo 3 (microempresas): verificar en la Fase 0 si aparece y si vale la pena.

## 3. Fuentes verificadas (2026-11-12)

### 3.1 Estados financieros NIIF — Supersociedades en datos.gov.co

Licencia **CC BY-SA 4.0** (obliga a citar y a compartir derivados con la misma licencia). Datos actualizados el **6–7 de julio de 2026**. Formato **largo**: una fila por sociedad × informe × rubro × periodo.

| ID | Conjunto | Filas |
|---|---|---|
| `6hqw-m3dm` | Carátula | 9 622 096 |
| `pfdp-zks5` | Estado de situación financiera | 19 638 408 |
| `prwj-nzxa` | Estado de resultado integral | 8 091 357 |
| `y3gh-x5g7` | Otro resultado integral | (verificar) |
| `ctcp-462n` | Estado de flujo de efectivo | 6 360 333 |

Columnas comunes (11): `codigo_instancia` (id del informe), `nit`, `numero_radicado`, `id_punto_entrada`, `punto_entrada`, `id_taxonomia`, `taxonomia`, `fecha_corte`, `concepto` (rubro), `periodo`, `valor` (**texto**).

### 3.2 Hechos que condicionan el diseño

- **Cobertura por corte** (carátulas con NIT, cierre a 31-dic): 2015: 2 650 · 2016: 24 160 · 2017: 20 884 · 2018: 20 461 · 2019: 26 782 · 2020: 31 292 · 2021: 30 633 · **2022: 93 951 (anómalo; verificar si son duplicados, retransmisiones o Grupo 3)** · 2023: 33 139 · 2024: 30 700 · 2025: 29 167.
- **Puntos de entrada del corte 2024** (informes): Grupo 1 individual 3 125, separado 1 233, consolidado 443, combinado 136; Grupo 2 individual 22 805, separado 2 264, consolidado 619, combinado 76. Una sociedad puede tener varios informes por año.
- **`periodo`** cambia de formato entre años: en los cortes recientes es «Periodo Actual» / «Periodo Anterior»; en los antiguos trae fechas como «2015-dic-31». Usar solo el **periodo actual** de cada informe (el anterior sirve para validar reexpresiones).
- **`valor` es texto**: convertir con cuidado (vacíos, signos, «true/false» en la carátula). **Unidades por verificar** en la Fase 0: la carátula habla de «miles de pesos»; comprobar con estados publicados de dos o tres empresas conocidas.
- **Codificación dañada**: la API devuelve «�» en lugar de tildes («Gastos de administraci�n»). El mapeo de rubros debe normalizar texto (quitar acentos y el carácter de reemplazo, minúsculas, espacios) y no depender de la ortografía exacta.
- **Los nombres de los rubros cambian** entre taxonomías (años) y entre NIIF plenas y pymes. Hace falta una **tabla de mapeo** rubro → variable estándar, construida y probada en la Fase 0–1.
- **Carátula** (corte 2024, 30 701 informes): razón social, CIIU v4, ciudad y departamento del domicilio, tipo societario, fecha de constitución, «Estado actual», opinión del revisor fiscal, si hay reexpresión. También teléfono, correo y direcciones: **excluir**.
- **«Estado actual»** (todos los años): ACTIVA 330 889 · ACUERDO DE REORGANIZACIÓN 10 990 · ACUERDO DE REESTRUCTURACIÓN 2 384 · EN ETAPA PREOPERATIVA 764 · concordatos 165. Sirve como etiqueta auxiliar del modelo.
- **Opinión del revisor fiscal**: limpio 305 580 · con salvedad 5 134 · negativo 584 · abstención 488.

### 3.3 Fuentes complementarias

- `6cat-2gcs` — **10 000 empresas más grandes del país** (Supersociedades, CC BY-SA 4.0, cortes 2021–2025, 10 000 por año, formato ancho: NIT, razón social, supervisor, región, departamento, ciudad, CIIU, macrosector, ingresos operacionales, ganancia, activos, pasivos, patrimonio). Uso: **conciliación** de la transformación propia.
- **Base de procesos de insolvencia** de la Supersociedades: archivos Excel mensuales o trimestrales (reorganización, liquidación judicial), con procesos desde 2009, en [Procedimientos de insolvencia → Informes](https://www.supersociedades.gov.co/web/procedimientos-de-insolvencia/informes). **Por verificar** en la Fase 0: columnas, si trae NIT y fecha de admisión, términos de uso. Es la etiqueta principal del modelo de alerta.
- **IPC del DANE** (anual) para deflactar. **CIIU Rev. 4 A.C.** (DANE) para nombres de sectores.
- Descartado: estados de la Superfinanciera (no están en datos.gov.co en formato equivalente).

## 4. Arquitectura y flujo

Igual que el observatorio: por lotes, sin servidor de modelos, Parquet + DuckDB-WASM en el navegador, GitHub Actions como cómputo, R2 para datos, Vercel para el sitio. Costo 0 USD.

```
datos.gov.co (Socrata) ──► bronze (parquet por año y conjunto, solo rubros necesarios)
Supersociedades (Excel insolvencia) ─┘
        │  normalizar texto, mapear rubros, elegir informe por sociedad-año
        ▼
silver: estados_largos (nit, año, variable, valor) + empresas (identidad) + eventos de insolvencia
        │  pivotear, indicadores, deflactar, pares, percentiles, señales, modelo
        ▼
gold (R2 finanzas/gold/): empresas · estados · indicadores · sector_anio · señales · alerta_agregada · metadatos.json
        ▼
apps/finanzas (DuckDB-WASM lee gold por rangos; índice de búsqueda pequeño)
```

### 4.1 Ingesta

- **No** descargar los 44 millones de filas completas. Consultar con SoQL **por año** (`fecha_corte`) y **solo los rubros de la lista de mapeo** (`concepto in (...)`), paginando con `$limit`/`$offset` y `SOCRATA_APP_TOKEN`. Reusar `pipelines/common/socrata.py`.
- Bronze por año y conjunto en `data/finanzas/bronze/`. Un corte cerrado no cambia: se descarga una vez y se re-descarga solo si `data_updated_at` del conjunto cambió.
- **Elección del informe** por sociedad-año: individual sobre separado; si hay varios, el de radicado más reciente (retransmisión). Registrar cuántos se descartan.

### 4.2 Variables estándar (silver)

Del balance: activo total, activo corriente, efectivo, cuentas por cobrar corrientes, inventarios, propiedades planta y equipo, pasivo total, pasivo corriente, obligaciones financieras (corrientes y no corrientes), cuentas por pagar comerciales, patrimonio total, ganancias acumuladas.
Del resultado: ingresos de actividades ordinarias, costo de ventas, ganancia bruta, gastos de administración y de ventas, ganancia operacional, costos financieros, ganancia antes de impuestos, ganancia neta.
Del flujo: flujo de operación, de inversión y de financiación.

### 4.3 Indicadores (gold)

Margen bruto, operacional y neto; ROA y ROE; razón corriente y prueba ácida; endeudamiento (pasivo/activo) y apalancamiento (pasivo/patrimonio); cobertura de intereses; días de cartera, de inventario y de proveedores; ciclo de conversión de caja; crecimiento real de ingresos; flujo de operación sobre ingresos; **Altman Z''** (versión para mercados emergentes, solo como referencia académica).
Reglas: división segura (sin infinitos; denominador ≤ 0 → nulo con motivo), recorte de extremos solo para percentiles y gráficos, nunca en los valores mostrados.

### 4.4 Pares, percentiles y señales

- Grupo de pares: CIIU 4 dígitos × tercil de ingresos × año; respaldo a CIIU 2 dígitos si hay menos de 15 empresas **[CONFIRMAR]**.
- Percentil de cada indicador dentro de su grupo (mismo criterio que la araña del observatorio: porcentaje de pares estrictamente por debajo; para indicadores donde «menos es mejor», se invierte y se dice).
- **Señales** (reglas, lenguaje neutro): patrimonio negativo; pérdidas netas dos o más años seguidos; razón corriente < 1; cobertura de intereses < 1; caída real de ingresos > 30 %; opinión del revisor fiscal distinta de «limpio»; estado distinto de «ACTIVA».

## 5. Modelo: alerta temprana de insolvencia

- **Etiqueta:** la sociedad es admitida a reorganización o liquidación judicial (base de insolvencia, por NIT) en los **24 meses** siguientes al cierre del año *t*. Respaldo si la base no trae NIT: cambio de «Estado actual» a acuerdo de reorganización en la carátula de *t+1* o *t+2*.
- **Variables:** indicadores del año *t*, sus cambios frente a *t−1*, tamaño, edad, sector, región y señales. Nada posterior a *t* (sin fuga de información).
- **Sesgo de supervivencia:** muchas empresas en problemas **dejan de reportar**. Medir cuántas desaparecen y analizar «deja de reportar» como resultado aparte; no mezclarlo en la etiqueta sin decidirlo.
- **Validación temporal:** entrenar con cortes ≤ 2019, validar 2020–2021, probar 2022 (etiqueta completa hasta 2024). Desbalance fuerte esperado (~1 %): métricas PR-AUC, *recall* en el 5 % de mayor riesgo, Brier y curva de calibración.
- **Líneas base obligatorias:** Altman Z'' con su umbral publicado y una regresión logística. El modelo (LightGBM, ya en el proyecto) solo se adopta si les gana en la prueba.
- **Ficha del modelo** en `models/finanzas/FICHA_ALERTA.md`: datos, etiqueta, métricas, límites, usos no permitidos (crédito, contratación, decisiones sobre personas).
- **Publicación:** agregada por sector, región y tamaño (ver 0.2).

## 6. El sitio (`apps/finanzas`)

Next.js 16 con la misma configuración que `apps/seguridad` (`basePath`, `cacheComponents`, Tailwind 4, `@dcc/marca`, `@dcc/comunidad`, DuckDB-WASM, ECharts). Antes de escribir código, leer la guía de Next en `node_modules/next/dist/docs/` (esta versión tiene cambios).

Páginas y secciones:
1. **Buscador** (portada de la app): por NIT o razón social, con sugerencias; índice `empresas.parquet` (~30–40 mil filas) consultado en el navegador.
2. **Ficha** `/finanzas/empresa/<nit>` (compartible): identidad (razón social, sector, ciudad, tamaño, años reportados); cifras clave del último año; series de 10 años; araña de indicadores contra la mediana de pares; tabla de percentiles; señales; fuente y fecha de corte.
3. **Comparar dos empresas**: mismo patrón del modo comparar del observatorio (dos arañas, tabla, frase automática, enlace compartible).
4. **Sector**: elegir CIIU; distribución de cada indicador, mediana por año, dispersión y alerta agregada.
5. **Metodología** `/finanzas/metodologia`: fuentes, mapeo de rubros, definiciones, límites, ficha del modelo.
6. Comentarios y feedback (`hilo = app:finanzas`) y artículos relacionados, como en el observatorio.

Requisitos: funciona en celular; accesibilidad (axe sin violaciones, Lighthouse ≥ 95); la ficha carga en < 2 s después de la primera carga; `prefers-reduced-motion`; cifras con formato colombiano; sin datos de contacto.

## 7. Estructura de carpetas

```
apps/finanzas/                 # sitio (zona /finanzas)
pipelines/finanzas/            # config.py, ingesta.py, conceptos.py (mapeo), transformar.py, indicadores.py, pares.py, publicar.py, validaciones.py
models/finanzas/               # alerta.py, evaluar.py, FICHA_ALERTA.md, artifacts/
tests/finanzas/                # pruebas de mapeo, indicadores, pares, validaciones y modelo
notebooks/finanzas/            # exploración de la Fase 0
docs/finanzas/                 # fuentes.md, decisiones.md, metodologia.md
data/finanzas/                 # bronze/silver/gold locales (ignorado por git)
.github/workflows/ingesta-finanzas.yml
```

## 8. Fases y criterios de aceptación

Trabajar fase por fase. Al terminar cada una: verificar sus criterios ejecutando las pruebas, commit local, marcar la fase en «Estado» y **detenerse** para revisión.

### Fase 0 — Verificación de fuentes y decisiones
- Crear las subcarpetas de la sección 7 (vacías o con `__init__.py`).
- Confirmar IDs, columnas, licencias y fechas de actualización de los conjuntos de 3.1 y 3.3.
- Explicar el pico de 2022 (93 951 informes): duplicados, retransmisiones o Grupo 3.
- **Unidades**: comprobar con dos o tres empresas conocidas que `valor` está en miles de pesos (o en pesos).
- **Matriz de rubros**: para cada año × grupo (plenas, pymes), qué etiquetas existen para cada variable estándar de 4.2. Proponer la tabla de mapeo.
- Base de insolvencia: descargar un archivo, documentar columnas, si trae NIT y fecha de admisión, y su licencia o términos.
- Cobertura real del modelo: cuántos eventos de insolvencia se pueden unir por NIT con empresas que reportan estados.
- Entregar `docs/finanzas/fuentes.md` con hallazgos y recomendación de alcance, y las decisiones de 0.3 planteadas al autor.
- **Aceptación:** el autor confirma alcance, pares y la política de publicación del modelo.

### Fase 1 — Ingesta y transformación (local)
- Ingesta por año y rubro a bronze; normalización de texto; mapeo; elección de informe; silver y gold de estados e indicadores.
- **Aceptación:** para el corte 2024, ingresos y activos de las empresas que están en las «10 000 más grandes» cuadran con `6cat-2gcs` (mediana del error < 1 %, y se explican los casos > 5 %); ≥ 95 % de los informes individuales de cada año tienen las ocho variables núcleo (activo, pasivo, patrimonio, activo y pasivo corriente, ingresos, ganancia operacional, ganancia neta); la identidad contable (activo = pasivo + patrimonio) se cumple en ≥ 99 %; pruebas en verde.

### Fase 2 — Calidad y automatización
- Validaciones (pandera) por capa; `ingesta-finanzas.yml`: ejecución manual y revisión mensual de `data_updated_at` (solo reconstruye si cambió); sube a `finanzas/gold/` en R2; abre un *issue* si falla y no publica nada a medias.
- **Aceptación:** una corrida manual en Actions deja gold en R2; una validación forzada a fallar abre un issue y no publica.

### Fase 3 — Indicadores, pares y señales
- Indicadores de 4.3, deflactación con IPC, pares y percentiles de 4.4, señales.
- **Aceptación:** revisión manual de 5 empresas de sectores distintos contra sus estados en el SIIS (indicadores correctos); pruebas de división segura y de percentiles; ninguna columna de contacto en gold (prueba automática).

### Fase 4 — Modelo de alerta
- Etiqueta, variables, validación temporal, líneas base, ficha y salidas agregadas.
- **Aceptación:** `metrics.json` con PR-AUC, recall@5 % y Brier del modelo y de las dos líneas base en el año de prueba; curva de calibración; ficha completa. Si el modelo no supera a las líneas base, se publica la mejor línea base y se explica: es un resultado válido.

### Fase 5 — Sitio `apps/finanzas` (local)
- Buscador, ficha, comparar, sector, metodología, comunidad.
- **Aceptación:** funciona en celular (375 px sin desborde) y escritorio; axe sin violaciones; build, lint y tipos sin errores; la ficha de una empresa grande y la de una pequeña se ven bien; ningún dato de contacto visible.

### Fase 6 — Integración en la plataforma y despliegue (cada paso con confirmación)
- Portal: `rewrites` de `/finanzas`, tarjeta en la portada, `"finanzas"` en `APPS_VALIDAS` de los artículos.
- Función `dcc-comunidad` v3: `"finanzas"` en `APPS` y eventos nuevos en la lista blanca (p. ej. `buscar_empresa`, `ver_empresa`, `comparar_empresas`, `ver_sector`), con sus pruebas.
- CI con la nueva app; proyecto de Vercel `dcc-finanzas` (raíz `apps/finanzas`, Node 22, archivos fuera de la raíz, protección desactivada); variables públicas; despliegue; `ZONA_FINANZAS_URL` en el portal y redespliegue del portal.
- **Aceptación:** `https://<dominio del portal>/finanzas` sirve la app; comentarios, feedback y eventos funcionan de punta a punta; el observatorio sigue igual (sus pruebas y su página publicada sin cambios).

### Fase 7 — Artículo, metodología y lanzamiento
- Artículo MDX del caso (Libro → Marco → Datos → Hallazgo → Recomendación) con estado `borrador` hasta que el autor lo apruebe; metodología completa.
- **Aceptación:** el autor aprueba los textos; la revisión mensual corre sola una vez sin intervención.

## 9. Costos

0 USD: Vercel Hobby (un proyecto más), R2 dentro del plan gratuito (gold estimado < 200 MB), GitHub Actions en repo público, Supabase sin objetos nuevos (solo la función actualizada).

## 10. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Rubros que cambian de nombre entre años y entre plenas y pymes | Matriz de rubros en la Fase 0; mapeo probado; reporte de cobertura por año |
| Unidades mal interpretadas (pesos o miles) | Verificación con empresas conocidas y conciliación con `6cat-2gcs` |
| Duplicados y retransmisiones (pico de 2022) | Regla explícita de elección de informe; conteo de descartes |
| Daño reputacional a empresas reales | Sin puntajes individuales; lenguaje neutro; aviso permanente; canal de feedback para correcciones |
| Datos de contacto en la fuente | Se excluyen en bronze → silver; prueba automática en gold |
| Sesgo de supervivencia en el modelo | Medir y reportar quién deja de reportar; no esconderlo |
| Volumen de la fuente (44 M filas) | Filtrar por año y rubro en la consulta; cortes cerrados se descargan una vez |
| Licencia CC BY-SA | Cita visible en cada página y en la metodología; gold publicado bajo la misma licencia |
| Afectar al observatorio | Subcarpetas propias; compartido sin modificar; CI de ambas apps en cada cambio |

## 11. Estado

- [x] Fase 0 (2026-11-12, confirmada por el autor; ver docs/finanzas/fuentes.md y decisiones.md) · [x] Fase 1 (2026-11-12, local; ver docs/finanzas/calidad_fase1.md y decisiones.md F5) · [~] Fase 2 (publicación manual en R2 verificada 2026-11-12; falta la corrida con fallo forzado) · [ ] Fase 3 · [ ] Fase 4 · [ ] Fase 5 · [ ] Fase 6 · [ ] Fase 7
