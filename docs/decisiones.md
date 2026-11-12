# Registro de decisiones

## 2026-11-09 · D1 · Familia de conjuntos fuente
Se propone usar la familia del Observatorio MDN (MinDefensa) en datos.gov.co: esquema homogéneo, `fecha_hecho` como fecha real,
`cod_muni` DIVIPOLA y datos hasta 2026-09-30, frente a los de DIJIN (fecha en texto, `codigo_dane`, corte 2026-07-31).
Los de DIJIN se usan para reconciliar totales. Pendiente de confirmación del autor. Ver docs/fuentes.md.

## 2026-11-09 · D2 · `uv` no instalado
No está instalado en la máquina; se pide autorización para instalarlo antes de crear `pyproject.toml`.

## 2026-11-09 · D3 · Confirmaciones (mensaje "avancemos")
Se tomó "avancemos" como aprobación de las recomendaciones de docs/fuentes.md: familia A (MDN), seis delitos (sin extorsión), inicio en 2018 e instalar `uv`
(instalado con winget). MGN sigue sin definir; no se necesita hasta la Fase 4.

## 2026-11-09 · D4 · Python 3.12 con uv
`.python-version` = 3.12. uv avisa "Missing expected target directory" al resolver 3.12 pero funciona; es un aviso del enlace de versión menor, no un fallo.

## 2026-11-09 · D5 · Resultados de la Fase 1 (local)
- Bronze: 1 775 265 filas crudas (6 delitos, 2018-01 a 2026-09). Silver: 4 714 449 hechos (suma de `cantidad`).
- **Totales anuales por delito = fuente exacta (0,00 %)** en todos los años 2018-2026 (comprobado contra la API con agregación SoQL).
- Gold: `municipios`, `hechos_mes_mpio` (1,2 MB), `hechos_semana_mpio` (2,2 MB). Muy por debajo de 30 MB.
- **3 hechos (de 4,7 millones) con `cod_muni` = 52000** (Nariño sin municipio) no entran al gold porque no hay municipio en DIVIPOLA. Se documentan; no se reasignan.
- Población DANE: el xlsx trae 1 123 municipios y DIVIPOLA 1 122; sobra `94663` (Mapiripana, Guainía). No afecta a los hechos.
- La semana se define como lunes de la semana ISO; la última (2026-09-28) es parcial (hasta el 30-sep).
- **Intermitencia (semanas con al menos un hecho, sobre 456):** solo 12 municipios tienen ≥400 semanas con homicidios, 36 en hurto a comercio, 41 en vehículos, 42 en residencias, 91 en lesiones, 108 en hurto a personas.
  En homicidio 1 072 de 1 122 municipios tienen menos de la mitad de las semanas con datos. Consecuencia para la Fase 3: pronóstico semanal municipal solo donde hay volumen; el resto a nivel departamental o mensual.
- No se detectaron cambios de esquema dentro de la familia A para 2018+ (mismas columnas en todos los meses).
- **Pendiente de la Fase 1:** estimar *N* (registro tardío). Requiere comparar cargas sucesivas; hoy hay una sola. Se guardará una instantánea por corrida desde la Fase 2 y se estimará con las primeras semanas de ingesta. Mientras tanto, regla provisional: marcar las últimas 8 semanas como provisionales.

## 2026-11-09 · D6 · Fase 2 (parte local)
- Validaciones (`validaciones.py`): esquemas pandera para silver y gold mensual; frescura (último hecho ≤ 60 días); caída > 50 % semana contra semana por delito,
  vigilando solo las últimas 8 semanas y sin comparar las 2 últimas (provisionales); conciliación silver = gold. Si falla: código 1, reporte en `data/validacion_reporte.md`.
  Probado con datos reales (OK) y con `FORZAR_FALLO=1` (sale con 1). 5 pruebas con datos sintéticos.
- Por qué solo las semanas recientes: una caída histórica (p. ej. confinamiento de 2020) es real y no debe bloquear publicaciones.
- Publicación (`publicar.py`): sin variables R2_* corre en simulación. Sube `gold/*` y una instantánea semanal `snapshots/semanal_AAAA-MM-DD.parquet`;
  las instantáneas permiten estimar *N* (registro tardío) cuando haya 4-8 corridas.
- `ingesta.yml`: lunes 11:00 UTC y `workflow_dispatch` con `forzar_fallo` y `solo_simulacion`. Bronze se conserva con `actions/cache` (el caché de GitHub se borra a los 7 días sin uso;
  si se pierde, la corrida descarga todo, ~10 min). Si cualquier paso falla se abre un issue y no se publica.
- Secrets de GitHub que debe cargar el autor: `SOCRATA_APP_TOKEN` (opcional), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `VERCEL_DEPLOY_HOOK`.
- Pendiente (acciones hacia afuera, requieren confirmación): crear repo en GitHub y push, bucket de R2 y CORS, proyecto en Vercel y su deploy hook, corrida manual en Actions.

## 2026-11-09 · D7 · R2: bucket y CORS (pendiente de crear)
Bucket propuesto: `datos-con-criterio` (ubicación automática). Lectura pública solo de `gold/` y `snapshots/` (son datos agregados abiertos); escritura solo con la clave de la API.
CORS en `docs/r2-cors.json`: GET/HEAD y cabecera Range (DuckDB-WASM lee Parquet por rangos). Se permite `*` porque los datos son públicos y de solo lectura;
se puede restringir a `luiseromero.com` y al dominio `*.vercel.app` cuando existan.
**Hecho (2026-11-11):** R2 activado por el autor (plan gratuito, $0/mes de base). Bucket `datos-con-criterio` y CORS creados con Wrangler (sesión OAuth del autor); el conector de Cloudflare
seguía `needs_auth`. Wrangler usa otro formato de CORS: `docs/r2-cors.wrangler.json` (el de `docs/r2-cors.json` es el del panel).
Acceso público habilitado el 2026-11-11 en `https://pub-9d9d9ff84f4e49209f1c0cdfdaaaf366.r2.dev` (r2.dev: con límite de velocidad, para desarrollo; pasar a dominio propio en producción).
Pendiente: token de API y secrets de GitHub.

## 2026-11-11 · D8 · Cierre de la Fase 2
- Corrida manual de `ingesta.yml` (run 43111598999): ingesta, transformación, validaciones y publicación en verde; gold en R2 (4 archivos, 200 OK, lectura por rangos 206 con CORS).
- Primera corrida (43107975573) falló en la subida con `AccessDenied`: el token de R2 se había creado como solo lectura. Corregido a Object Read & Write sobre el bucket; no se cambiaron claves.
- Corrida con `forzar_fallo=true` (run 43115659624): falla en "Validar", se omiten "Publicar a R2" y "Deploy hook", se abre el issue con el motivo y R2 conserva la publicación anterior (`actualizado` sin cambio). Criterio de aceptación cumplido.
- **Cambio al plan:** el proyecto de Vercel y su deploy hook se crean en la Fase 5, cuando exista `site/`. Un proyecto de Vercel sin sitio no despliega nada y el hook no se puede probar. `VERCEL_DEPLOY_HOOK` sigue sin existir; el workflow lo omite sin fallar.
- Los issues #1 y #2 son de prueba y se pueden cerrar.

## 2026-11-11 · D9 · Segmentación del pronóstico
Municipal solo si la media semanal es ≥ 2 hechos (415 series: homicidio 19, hurto a comercio 51, a personas 123, a residencias 51, a vehículos 50, lesiones 121); departamental siempre (33 × 6 = 198).
Total 613 series. Razón: con media < 2 la serie es casi toda ceros y el error relativo no significa nada. Umbral en `models/seguridad/prep.py` (`UMBRAL_MEDIA_MPIO`).

## 2026-11-11 · D10 · Horizonte de 16 semanas (cambio al plan)
El plan pedía 8 semanas. Con 8 semanas provisionales descartadas y 3 semanas de retraso de publicación, 8 semanas desde la última confiable (2026-07-27) terminan el 21-sep, antes del corte (30-sep): ninguna sería futura.
Se pronostican **16 semanas**, validadas en el backtest por tramo (1-8 y 9-16): las 8 primeras cubren las provisionales y las demás llegan hasta unas 7 semanas de futuro real (`tipo` = `provisional` | `futuro` en predicciones.parquet).
Si el registro tardío resulta menor que 8 semanas, se reduce `SEMANAS_PROVISIONALES` y el horizonte puede bajar.

## 2026-11-11 · D11 · Resultados del backtest y elección del método
12 cortes, 16 semanas, paso 8 (2024-07 a 2026-04). Método y cuantiles conformales se eligen con los cortes 1-6; se reporta con los 7-12.
- Elegir un modelo **por grupo** sobreajustó (WAPE 0,2461 contra 0,239 del promedio en pruebas de ese momento); se cambió a **un único método para todos**, elegido por menor WAPE en 1-6.
- Con horizonte de 16 la regla elige **TSB**: WAPE 0,2407 frente a 0,2609 de la mejor base (media móvil 4): **7,7 % menos de error**. Mejora en 6 de 6 delitos (1,7 % a 10,0 %); tramos 1-8: 7,9 %, 9-16: 7,6 %.
- LightGBM (con rezagos, festivos y quincenas) no gana: WAPE 0,2593. TSB es un nivel plano; se documenta en la ficha.
- Cobertura del intervalo 80 %: 0,792 (semanas 1-8) y 0,779 (9-16); por grupo entre 0,73 y 0,81.
- Salvedad: se compararon alternativas mirando también los cortes 7-12, por lo que la cifra de evaluación es algo optimista.
- Registro tardío (indicio, no medición): para hurto de vehículos, lo que tenía la DIJIN el 31-ago frente a MDN el 21-oct da razones de 0,97 (mayo), 0,90 (julio) y 0,57 (última semana, parcial por construcción). Se mantienen 8 semanas provisionales.

## 2026-11-11 · D12 · Artefactos y flujo de modelos
`models/seguridad/artifacts/{seleccion.json,metrics.json}` versionados como valor por defecto. `modelos.yml` (día 1 de cada mes) reentrena, evalúa y sube a R2 `models/`. `ingesta.yml` descarga el vigente de R2 (si no hay, usa el del repo),
corre `predecir.py`, valida (incluye coherencia de intervalos) y publica `gold/predicciones.parquet`, `gold/metrics.json` y `gold/metadatos.json` (versión y método del modelo).

## 2026-11-11 · D13 · Corrección: `tipo` de las predicciones en Actions
La primera corrida de ingesta con predicciones (run 43119752872) publicó las 9 808 filas como `futuro`: `predecir.py` leía `fecha_corte` de `metadatos.json`, que en un servidor limpio aún no existe en ese paso.
En local no se veía porque el archivo quedaba de corridas anteriores. Ahora `fecha_corte()` se calcula desde silver y `marcar_tipo()` tiene prueba. Hasta relanzar la ingesta, `gold/predicciones.parquet` en R2 tiene el campo `tipo` incorrecto (los demás campos son correctos).
Lección: probar los pasos de Actions sin los archivos residuales del equipo local.

## 2026-11-11 · D14 · MGN resuelto
Polígonos municipales del MGN 2018 desde el servicio ArcGIS del DANE (ver docs/fuentes.md). Verificado: 1 122 polígonos únicos, sin geometrías vacías, códigos = DIVIPOLA salvo 94663 (solo MGN) y 27493 (solo DIVIPOLA), ambos sin hechos.
Pendiente para la Fase 4: instalar geopandas/libpysal/esda y validar geometrías y contigüidad Queen (con tolerancia por la simplificación).

## 2026-11-12 · D15 · Fase 4: anomalías y puntos calientes (local)
**Anomalías** (`models/seguridad/anomalias.py`): esperado = mediana de las 26 semanas previas; puntaje = (valor − esperado)/√(esperado+1), estandarizado con la MAD de la serie; atípica si |z| > 3. Mismas 613 series del pronóstico; solo semanas confiables (hasta 2026-07-27).
Resultado: 3 696 semanas atípicas de 258 686 evaluadas (1,43 %). Se guardan solo las atípicas (`gold/anomalias.parquet`), no todas las semanas.
- Defecto hallado al revisar casos: sin piso en la desviación, series casi todo ceros (MAD = 0) daban z de millones. Se añadió `SIGMA_MIN = 1` (un conteo no es menos disperso que Poisson), una prueba y una validación de |z| ≤ 100.
- Casos que tienen sentido: inicio del confinamiento (semana 2020-03-23/30: hurto a personas en Bogotá 413 vs 2 338 esperados); paro nacional (2021-04-26: hurto a comercio en Valle del Cauca 334 vs 90; 2021-05-17: homicidio en Valle 90 vs 43).
- Caso no explicado: semana 2019-12-30, 61 series de hurto a personas "altas" (z medio 5,5). Puede ser un efecto de cambio de año o de registro; no se ha investigado.
- Limitación: la línea base no tiene estacionalidad; semanas de fin de año pueden salir atípicas por calendario.

**Puntos calientes** (`models/seguridad/hotspots.py`): Gi* (esda) sobre tasas por 100 000 hab. suavizadas con Bayes empírico, contigüidad Queen del MGN 2018 (1 122 polígonos; solo San Andrés y Providencia sin vecinos), FDR (Benjamini-Hochberg, q < 0,05).
Ventanas de 52 semanas hasta 2026-07-27 (últimas vs previas). Población 2026 en ambas, para aislar el cambio en hechos. 94663 (Mapiripana, población 0 en el DANE, sin hechos) se excluye de los pesos.
Resultado (1 121 municipios por delito): homicidio 1 emergente y 3 en disminución; hurto a personas 1 emergente y 3 persistentes; hurto a residencias 1 emergente; hurto de vehículos 4 emergentes y 1 persistente; hurto a comercio y lesiones, ninguno.
Casos coherentes: Cota, Funza y Mosquera (Sabana de Occidente) en hurto a personas; Villa Rica, Puerto Tejada, Caloto, Guachené y Jamundí (norte del Cauca y sur del Valle) en hurto de vehículos; Briceño y Toledo (Antioquia) en homicidio.
Limitaciones: la FDR es conservadora y las tasas tienen cola larga, por eso hay pocos puntos calientes y **ningún punto frío**. Un caso débil: Nariño (52480), hurto a personas "emergente" con solo 20 hechos.
Se usó el Queen directo del MGN simplificado (~55 m): sin huecos relevantes. Mi primer intento de tolerancia con buffer fue un error de mi script y no hizo falta.
Integración: `ingesta.yml` descarga el MGN solo si falta (caché `mgn-2018-v1`), corre anomalías y hotspots antes de validar; `validaciones.py` revisa categorías, rangos y cobertura.

## 2026-11-12 · D16 · El MGN se lee de R2 en Actions (el DANE rechaza los runners)
La primera ingesta con Fase 4 (run 43127891663) falló en la descarga del MGN: `SSLEOFError: UNEXPECTED_EOF_WHILE_READING` contra `portalgis.dane.gov.co`.
Desde el equipo del autor la misma llamada funciona y el certificado es válido (Sectigo, vence 2027-02), por lo que no es de certificado; lo más probable es que el servidor corte las conexiones de los centros de datos de GitHub (no confirmado).
Decisión: copia fija del MGN 2018 en R2 (`ref/mgn_municipios_2018.geojson`, 8,6 MB, vigencia que no cambia). `pipelines/seguridad/mgn.py` lee de R2 por defecto (`MGN_URL` para cambiarla) y `--desde-dane` refresca desde la fuente oficial para volver a subirla.
Lección repetida: probar cada paso nuevo en Actions antes de darlo por bueno; los fallos que no se ven en local son de entorno.

## 2026-11-12 · D17 · Fase 5: sitio Next.js (local)
**Stack:** Next.js 16 (App Router, TypeScript), Tailwind 4, `@duckdb/duckdb-wasm`, ECharts, MapLibre GL. Código en `site/`. Los datos se leen directamente de R2 (`NEXT_PUBLIC_DATA_URL`, por defecto la URL pública `r2.dev`) con DuckDB-WASM cargado de forma diferida.
**Rutas:** `/` (portada), `/casos/observatorio-seguridad` (la app), `/casos/observatorio-seguridad/metodologia` (métricas del modelo leídas en vivo de `gold/metrics.json`), `/sobre-mi`. Todas estáticas.
**Contenido de la app:** memo (marcado como pendiente del autor), filtros (delito, departamento, municipio, periodo), cifras, mapa coroplético con contornos de puntos calientes, serie semanal con pronóstico, intervalo del 80 % y semanas atípicas marcadas, tablas de variación y de semanas atípicas, y la etiqueta «Datos actualizados al…» con enlaces a metodología y código.
**Diseño:** atlas editorial (papel cálido, Fraunces/IBM Plex, bermellón), modo oscuro real, margen de 16 px, sin desbordamiento horizontal.

**Cambios al plan (a confirmar por el autor):**
1. **Sin PMTiles:** el mapa usa un GeoJSON simplificado (`site/public/data/municipios.geojson`, 1,95 MB, ~275 m de tolerancia, generado por `pipelines/seguridad/mgn_web.py`). PMTiles exigía herramientas (tippecanoe) que no corren en Windows y no hacen falta con 1 122 polígonos.
2. **DuckDB-WASM desde jsDelivr:** los binarios WASM (decenas de MB) no caben cómodamente en el repo; se cargan del CDN. Es una dependencia externa del sitio; si no se quiere, se alojan en R2.
3. **Worker de MapLibre como estático:** MapLibre 6 carga su worker como módulo ES y Turbopack no lo resuelve; `scripts/copiar-worker.mjs` lo copia de `node_modules` a `public/vendor/maplibre` en cada `dev`/`build` (ignorado por git).

**Verificación (build de producción, Lighthouse móvil):** accesibilidad 100 en las 4 páginas (criterio ≥ 95), rendimiento 94-97, buenas prácticas 100, SEO 100; FCP/LCP 0,8 s, TBT 290 ms, CLS 0. Contraste mínimo de los colores clave: 5,28 (claro) y 6,84 (oscuro) sobre AA = 4,5. Los filtros actualizan los datos en ~125 ms en caliente (criterio < 1 s).
Primera versión de Lighthouse: accesibilidad 94 y rendimiento 79; se corrigió un `aria-label` sin rol, un salto de encabezado y se retrasó la carga del mapa y del gráfico hasta que estén cerca de la pantalla (TBT 950 → 290 ms).
No verificado: carga en frío con red lenta real; el despliegue en Vercel.

**Observación sobre los datos (para el autor):** la tabla de semanas atípicas destaca Guaviare con registros individuales de 27 (2026-01-12, El Retorno) y 38 víctimas (2026-05-26, San José del Guaviare); sin ellos 2026 llevaría ~31 homicidios. Pueden ser hechos reales con varias víctimas (p. ej. enfrentamientos armados) o errores de registro; no está verificado. El sitio los muestra como atípicos, sin interpretarlos.
