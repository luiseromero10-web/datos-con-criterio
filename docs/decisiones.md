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


## 2026-11-12 · D18 · P0 de PLAN_PLATAFORMA: verificaciones (solo lectura)
Respaldo previo: etiqueta `respaldo-pre-plataforma` y rama `respaldo/observatorio-pre-plataforma` (estado del observatorio local, 86 archivos versionados); etiqueta `visual-v1-editorial` con el diseño anterior. Locales, sin subir. Los datos descargados (`data/`) no están en git; se regeneran y el gold está en R2.

**`romi-app` (Supabase, ref emkinfqdwjtzkkyabmyb, sa-east-1), consultado sin modificar nada:**
- 13 MB de 500 MB; 19 tablas públicas con RLS (categories, products, inventory, sync_log, ai_config, customers, orders, order_items, app_users, conversations, messages, agents, app_settings, social_posts, baby_votes, baby_rsvp, lector_books, lector_reading_progress, nl_records); 0 tablas o funciones `dcc_`; 0 Edge Functions.
- Seguridad, línea base (15 avisos previos, todos de ROMI, no se tocan): 4 `function_search_path_mutable`; 5 `anon_security_definer_function_executable` y 5 `authenticated_security_definer_function_executable` (`buscar_inventario`, `crear_pedido_wpp`, `estado_pedido_wpp`, `get_my_role`, `producto_disponible`); 1 `auth_leaked_password_protection`.
  Observación para el autor: que `anon` pueda ejecutar por REST una función `SECURITY DEFINER` como `crear_pedido_wpp` merece revisión en ROMI, fuera del alcance de este plan.

**Límites verificados (documentación oficial):**
- Supabase gratuito: 500 000 invocaciones de Edge Functions al mes (cuota de toda la organización), 500 MB por proyecto, 5 GB de salida. **Pausa por inactividad a los 7 días** (restaurable hasta 90 días después).
- Turnstile gratuito: 20 widgets, 10 hostnames por widget, desafíos ilimitados.
- Cloudflare Web Analytics: gratis; sin cookies ni almacenamiento local para rastrear y sin identificación por IP (artículo oficial de 2020); eventos personalizados solo como plan a futuro; 10 sitios sin proxy. **Retención y muestreo: no documentados** en las páginas oficiales consultadas.
- Vercel Web Analytics (Hobby): 50 000 eventos al mes compartidos, sin eventos personalizados, ventana de 1 mes.

**Consecuencias para el plan:** presupuesto de invocaciones e interruptor de apagado (2.5); degradación sin romper si Supabase está pausado (P3); criterio de seguridad de P3 = «ningún aviso nuevo» frente a la línea base.
**Pendiente:** validación del autor de las decisiones 1 (multi-zonas), 2 (Supabase en ROMI con aislamiento), 3 (visitas con Cloudflare + eventos propios) y 5 (identidad visual) antes de P1.

## 2026-11-12 · D19 · Ajustes visuales tras revisión del autor
- Líneas entre municipios: eran blancas de 0,25 px con 60 % de opacidad y se perdían sobre los tonos claros de la rampa (y en oscuro casi no se veían). Ahora son oscuras en el tema claro (`#0b1f3a`, 40 %) y azul medio en el oscuro (`#7da0d6`, 55 %), con grosor que crece con el zoom (0,35 px a nivel país, 1,7 px muy cerca).
- Cifras clave: en la primera versión se pintaban en una tipografía monoespaciada ancha; al pasar a Archivo quedaron más angostas y livianas aunque el tamaño en código era el mismo (36 px). Ahora tienen tamaño explícito y proporcional al ancho: de 34 px en móvil a 52 px en escritorio.


## 2026-11-12 · D20 · P1: monorepo y multi-zonas (local)
**Estructura:** `apps/portal` (zona por defecto: portada, artículos, «Sobre mí», privacidad), `apps/seguridad` (el observatorio, con `basePath: "/seguridad"`), `packages/marca` (`@dcc/marca`: identidad común). Espacios de trabajo de npm con un solo `package-lock.json` en la raíz. `site/` se movió con `git mv` y conserva su historial.
**Zonas:** el portal reescribe `/seguridad` y `/seguridad/:path*` hacia `ZONA_SEGURIDAD_URL` (por defecto `http://localhost:3100`). Con `basePath`, los recursos de la zona quedan en `/seguridad/_next/…` y viajan por la misma regla, así que no hizo falta `assetPrefix`. Cada app nueva = un proyecto de Vercel + un par de reglas en el portal.
**Rutas estáticas:** `fetch()` y las URL de MapLibre no reciben el `basePath` solas; se arman con `apps/seguridad/lib/ruta.ts` (`/seguridad/data/municipios.geojson`, `/seguridad/vendor/maplibre/…`). `scripts/copiar-worker.mjs` busca `maplibre-gl` hacia arriba en `node_modules`, porque npm sube las dependencias a la raíz.
**Marca única (`packages/marca`):** `estilos.css` (tokens claro/oscuro, utilidades), `fuentes.ts` (Archivo y Martian Mono con `next/font`, que funciona desde un paquete), `componentes` (cabecera y pie, con `<a>` entre zonas), `mapa.ts` (rampa y colores de contorno). Las apps importan `@dcc/marca/estilos.css` y declaran `@source` para que Tailwind escanee el paquete. Ninguna app define colores ni fuentes propios.
**Cambios de ruta:** el observatorio pasó de `/casos/observatorio-seguridad` a `/seguridad`, y la metodología a `/seguridad/metodologia`. Cabecera común: Observatorio, Artículos, Sobre mí. Las rutas antiguas ya no existen (nada estaba publicado).
**Portal:** `/privacidad` es un **borrador** que describe cómo se operará cuando estén activas la analítica, los comentarios y el feedback (hoy no se recoge nada); `/articulos` está vacío; `/sobre-mi` sigue como espacio reservado.
**CI:** `ci.yml` con matriz `[portal, seguridad]`: `npm ci` en la raíz, lint, build y tipos por app (el build va antes porque genera los tipos de Next).

**Verificación (local):**
- Ambas apps en marcha (portal 3000, zona 3100): `localhost:3000/seguridad` muestra el observatorio completo con mapa y gráfico funcionando; las 9 rutas probadas responden bien (portada, 4 páginas del portal, observatorio, metodología, GeoJSON y los dos archivos del worker, estos con el tipo de contenido correcto).
- Builds de producción de las dos apps, `tsc` y `eslint` en ambas, `ruff` y las 33 pruebas de Python: en verde. `npm ci --dry-run` en verde.
- Lighthouse móvil (modo desarrollo, a través del portal), las 6 páginas: accesibilidad 100, buenas prácticas 100, SEO 100.
- Identidad: tokens (`--paper`, `--ink`, `--accent`, `--forecast`, `--senal`, `--rule`), fuentes (Archivo, Martian Mono), titular (118 %, peso 800) y cabecera idénticos en el portal y en el observatorio.

**No verificado / límites:**
- La navegación entre zonas es una carga completa (`<a>`), como indica la documentación de Next.
- En desarrollo, el HMR de la zona no atraviesa el portal; para editar una app, ábrala directamente en su puerto (`localhost:3100/seguridad`). Los enlaces a otra zona (p. ej. «Sobre mí» desde la zona) solo funcionan pasando por el portal, no en `localhost:3100`.
- `npm audit` marca 7 avisos moderados en `minimatch`, dependencia transitiva de las herramientas de desarrollo; no llega a lo que se publica.
- Rendimiento medido solo en modo desarrollo; no se midió el build de producción servido por el portal.
- Las pruebas de carga diferida (mapa y gráfico) requieren desplazamiento real de la página; con `scrollIntoView` programático el navegador de pruebas no las activa.


## 2026-11-12 · D21 · P2: analítica de visitas e interacción (local, en simulación)
**Paquete `@dcc/comunidad`** (`packages/comunidad`): `track(evento, propiedad?)`, `trackUnaVez`, `vaciarYa`, `modo()`, y los componentes `PanelEventosDev`, `AnaliticaVisitas` y `EventoVista`. La lógica de la cola (`rastreador.ts`) es pura y se prueba sola; el transporte y la configuración están aparte (`track.ts`, `config.ts`).

**Modos** (`modo()`): `simulacion` (desarrollo: nada sale del equipo; los eventos y los lotes se ven en el panel y en la consola), `real` (producción con `NEXT_PUBLIC_EVENTOS_URL`), `inactivo` (producción sin URL: no hace nada) y `apagado` (`NEXT_PUBLIC_EVENTOS=off`, que manda sobre todo y no exige redesplegar código).
**Privacidad por diseño:** nombres de evento `^[a-z][a-z0-9_]{0,39}$` y propiedad `^[A-Za-z0-9_-]{0,40}$`: no cabe texto libre. Se agrupan repetidos (evento + propiedad + n). El payload solo tiene `app` y `eventos`: sin identificador de visitante, IP ni hora. Respeta «No rastrear» (DNT) y el Control Global de Privacidad. No usa cookies ni almacenamiento local. El municipio se registra sin código.
**Presupuesto:** máximo 3 lotes por carga de página, un lote cada 10 s y hasta 50 pares por lote; además se envía lo pendiente al salir de la página (`pagehide`, `sendBeacon`). Con ~3 invocaciones por visita, la cuota gratuita de 500 000 invocaciones al mes alcanza para ~150 000 visitas.

**Contrato para P3 (`POST` a la función `dcc-comunidad`, ruta `/eventos`):**
- Cuerpo JSON enviado como `text/plain;charset=UTF-8` (evita la comprobación previa de CORS); la función lo interpreta como JSON.
- `{ "app": "seguridad", "eventos": [ { "evento": "filtro_delito", "propiedad": "hurto_vehiculos", "n": 2 } ] }`
- La función debe: validar `app` contra una lista blanca (`portal`, `seguridad`); validar cada nombre y propiedad con las mismas expresiones; aceptar hasta 50 eventos y `n` entre 1 y 1000; sumar en `dcc_eventos_dia` (fecha del servidor, app, evento, propiedad) y no guardar nada más; responder 204.
- Lista blanca de eventos: `vista_app`, `filtro_delito`, `filtro_departamento` (código o `pais`), `filtro_municipio`, `filtro_periodo` (`ult12`, un año o `todo`), `clic_mapa`, `clic_tabla_cambios`, `clic_tabla_atipicas`, `ver_metodologia`, `error_datos` (`inicio`, `consulta`, `serie`); reservados para P3 y P4: `abrir_articulo`, `comentario_enviado`, `feedback_enviado`.

**Visitas:** `AnaliticaVisitas` inyecta el script de Cloudflare Web Analytics solo en producción, con `NEXT_PUBLIC_CF_BEACON_TOKEN` y sin «No rastrear». El identificador es público; lo entrega el autor al desplegar. Retención de datos de Cloudflare: no documentada, no se promete.
**Panel de simulación** (solo desarrollo, esquina inferior derecha): muestra la cola, los lotes «enviados» (simulados), los eventos contados y los descartados con su motivo, y un botón «Enviar lote ahora». En producción no existe.

**Instrumentación:** el observatorio emite `filtro_*`, `clic_mapa`, `clic_tabla_*`, `error_datos` y `ver_metodologia`; ambas apps emiten `vista_app` una vez por carga de página, con su propio `app` (`NEXT_PUBLIC_APP_ID`).

**Verificación:**
- 21 pruebas automáticas (vitest) en verde: cola, agrupación, 3 lotes, 50 pares, validación de nombres, DNT, Control Global de Privacidad, apagado, modos, transporte real con `fetch` y `sendBeacon` simulados y desarrollo sin salida. Prueba de mutación: al desactivar a propósito el respeto a DNT y al apagado, 4 pruebas fallan; al romper la validación y el tope de lotes, 2 fallan.
- En el navegador (desarrollo, a través del portal): cada acción genera su evento con la propiedad esperada (filtros, clic real en el mapa, clics en ambas tablas, vista de la metodología); el lote se «envía» a los 10 s, agrupado; con el tope alcanzado, el evento siguiente queda descartado por `limite de lotes`; con DNT simulado, los eventos quedan descartados como `inactivo`.
- Producción (build servido por el portal): el panel no existe; con identificador se inyecta el script de Cloudflare con la URL y el atributo correctos; sin identificador no se inyecta nada.
- Lighthouse móvil, build de producción vía el portal (medianas de 3 corridas donde hubo duda; la variación entre corridas llega a ±5 puntos): portada 99 (antes 97), observatorio 97 (antes 94), metodología 96 (antes 95), Sobre mí 95 (antes 96); accesibilidad 100 en las cuatro. Criterio de no caer más de 3 puntos: cumplido.

**No verificado / límites:** el envío real a Supabase (llega en P3); el conteo real de visitas en Cloudflare (requiere publicar y el identificador); el panel no se probó en celular físico.


## 2026-11-12 · D22 · P3: comentarios, feedback y eventos (escritos y probados en local; sin aplicar)
**Entregado:** migración `supabase/migrations/20261112000000_dcc_comunidad.sql` (4 tablas y 3 funciones `dcc_`), su reversa `supabase/reversa/dcc_comunidad_bajar.sql`, la Edge Function `supabase/functions/dcc-comunidad/` (`logica.ts`, `manejador.ts`, `index.ts`), los componentes `Comentarios` y `FormularioFeedback` y el cliente de la API en `@dcc/comunidad`, y la guía `docs/despliegue-comunidad.md`.

**Diseño que conviene recordar:**
- Aislamiento: RLS activado con una política explícita que niega todo a `anon` y `authenticated` (así no aparece el aviso «RLS sin políticas»); sin privilegios de tabla para esos roles; funciones `SECURITY INVOKER`, `search_path` vacío y `EXECUTE` solo para `service_role`. Ninguna página usa claves de ROMI: todo pasa por la función.
- La función se despliega con `verify_jwt = false` (las claves nuevas de Supabase no son JWT) y se protege sola: origen permitido (también en las escrituras, porque un `POST` `text/plain` no dispara la comprobación previa de CORS), Turnstile, campo trampa, límite de 5 envíos por día por origen y validación de longitudes. Si falta configuración, **se niega a escribir** en lugar de funcionar a medias.
- Privacidad: no se guarda la IP. El cupo usa `SHA-256(sal | día | IP | tipo)`: la misma persona produce otra clave cada día y el hash no se puede volver IP. El día se cuenta en hora de Colombia. Un robot que llena el campo trampa recibe «todo bien» y no se guarda nada. El contacto del feedback solo se guarda con consentimiento expreso (lo exigen la función y la base).
- Eventos: lista blanca de eventos y de la forma de cada propiedad en el servidor (misma que el contrato D21); las propiedades libres no caben. Se agrupan en la base con `dcc_sumar_eventos` (atómico, agrupa duplicados del lote).
- Claves de Supabase: la función lee `SUPABASE_SECRET_KEYS` (`default`) y cae a `SUPABASE_SERVICE_ROLE_KEY` (antigua, vigente hasta fin de 2026).
- Cliente: la lista de comentarios se pide solo cuando la persona la abre (cuota). En desarrollo todo es simulación (comentarios de ejemplo; lo que se envía no se guarda). Sin configuración en producción, o con el proyecto pausado, los componentes dicen «no disponible por ahora» y la app sigue funcionando.

**Criterio de aceptación ajustado:** «ningún aviso nuevo» se mide contra la línea base de 15 avisos de seguridad y 21 de rendimiento (D18 y `docs/despliegue-comunidad.md`), y significa ningún aviso de seguridad nuevo y ningún WARN de rendimiento nuevo. Los dos índices de `dcc_comentarios` pueden figurar como `unused_index` (INFO) hasta que tengan uso.

**Verificación (local):**
- 81 pruebas automáticas: 52 en `supabase` (migración contra un Postgres real local con PGlite y los roles de Supabase; función con una base de mentira) y 29 en `@dcc/comunidad` (analítica y cliente). Más 33 de Python y los lint, tipos y builds de siempre.
- Migración: `anon` y `authenticated` no pueden leer, escribir ni ejecutar nada `dcc_`; `service_role` sí; ninguna función es `SECURITY DEFINER`; un objeto ajeno queda intacto (datos, RLS y políticas); la reversa deja la base exactamente como estaba y se puede reaplicar.
- Pruebas de mutación: con 4 alteraciones deliberadas de la migración fallan 7 pruebas; con 5 de la función (sin Turnstile, sin comprobar origen, sin campo trampa, sin límite, cupo con IP sin sal) fallan 6. Restauradas, pasan todas.
- Navegador (simulación): abrir comentarios, escribir y enviar; la respuesta del autor aparece anidada; el feedback exige la autorización para guardar un contacto; se registran `comentario_enviado` y `feedback_enviado:<tipo>`; el campo trampa queda fuera de pantalla; en celular, una columna, sin desbordamiento y controles de al menos 44 px.
- Accesibilidad (axe-core, página completa con ambos formularios abiertos): 0 violaciones, 48 reglas superadas. Quedan «incompletas» las de contraste, porque axe no puede calcular el fondo sobre la retícula de degradado; los contrastes se verificaron numéricamente (D17).
- **Defecto hallado de la Fase 5 y corregido:** el título de cada sección del observatorio se enlazaba con `aria-labelledby` a un identificador con espacios («h-01 · Dónde»), que se lee como varias referencias y no resuelve. Afectaba a las cinco secciones y Lighthouse no lo marcaba. Ahora usan un identificador de una sola palabra.

**No verificado:** nada contra el Supabase real (la migración y la función no se han aplicado ni desplegado); Turnstile real; el flujo de punta a punta (comentario → aprobación → aparición); que la función arranque en Deno (se probó su lógica en Node, no el `Deno.serve` ni la importación de `supabase-js`); el límite real de 429 contra la base real; el formulario con el widget real de Turnstile.
**Pendiente (cada uno con confirmación y, donde se indica, con acciones suyas):** aplicar la migración, crear el widget y cargar los secretos, desplegar la función, variables de entorno y pruebas de humo (`docs/despliegue-comunidad.md`).


## 2026-11-12 · D23 · P3: migracion dcc_comunidad aplicada en romi-app
**Hecho (con confirmacion del autor):** `apply_migration` con el contenido exacto de `supabase/migrations/20261112000000_dcc_comunidad.sql`. Resultado: success.

**Verificacion contra la base real:**
- Tablas public 19 -> 23 (4 `dcc_`, las 4 con RLS); funciones 8 -> 11 (3 `dcc_`, ninguna SECURITY DEFINER); politicas 38 -> 42; indices 31 -> 37.
- Permisos: `anon` y `authenticated` NO pueden leer/escribir las tablas ni ejecutar las funciones `dcc_`; `service_role` si.
- Datos ajenos intactos: lector_books 9, lector_reading_progress 5, nl_records 54 (igual que antes).
- Analizador de seguridad: 15 avisos, los mismos de la linea base (ninguno nuevo). Rendimiento: 21 -> 23; los 2 nuevos son `unused_index` (INFO) de `dcc_comentarios`, esperado en tabla nueva; ningun WARN nuevo.

**Pendiente:** widget de Turnstile y 3 secretos (autor), desplegar `dcc-comunidad`, pruebas de humo, variables de entorno.


## 2026-11-12 · D24 · P3: funcion dcc-comunidad desplegada en romi-app
**Hecho (con confirmacion del autor):** secretos `TURNSTILE_SECRET`, `DCC_SAL_HASH` y `DCC_ORIGENES` cargados por el autor; despliegue de `dcc-comunidad` (version 1, `verify_jwt=false`). Un cambio menor previo: en `logica.ts` los caracteres invisibles de una expresion regular pasaron a escapes `\uXXXX` (mismo comportamiento, ya no depende de caracteres invisibles en el archivo); 52 pruebas siguen pasando.

**Pruebas de humo contra la funcion real:** `/salud` 200; OPTIONS con origen permitido 204 con CORS; origen ajeno 403 (OPTIONS y POST); POST `/eventos` valido 204 y fila en `dcc_eventos_dia` (fila de prueba borrada despues); POST comentario con token falso 403 `verificacion_fallida` y 0 filas en `dcc_comentarios`; GET `/comentarios` 200 vacio.

**No verificado aun:** Turnstile con token real, envio de punta a punta desde una app publicada, el 429 del sexto envio (requiere tokens reales), el arranque con `SUPABASE_SECRET_KEYS` fue ejercitado por eventos y lectura (funciona).
**Pendiente:** variables de entorno de las apps (Site key) y publicacion (P5).


## 2026-11-12 · D25 · P3: flujo real de comentarios verificado de punta a punta
**Prueba:** app de seguridad compilada en produccion y servida en `localhost:3000` (origen permitido), con la Site key real de Turnstile en `apps/seguridad/.env.production.local` (ignorado por git). Un comentario enviado desde el Chrome del autor con el widget real: respuesta \"Gracias, se publicara cuando el autor lo apruebe\"; fila `pendiente` en `dcc_comentarios` (hilo `app:seguridad`, `app_origen` seguridad); limite diario guardado como hash SHA-256 de 64 caracteres, sin IP; tras aprobarla (`estado=aprobado`) aparecio en `GET /comentarios` y en `GET /conteos`. Datos de prueba borrados despues.

**Hallazgo:** el navegador integrado del panel de Claude falla el widget con el error 600010 (Cloudflare lo trata como automatizado); en un Chrome normal funciona. No es un defecto de la app ni de la configuracion.

**Sigue sin verificar:** el 429 del sexto envio (necesita 6 tokens reales), el formulario de feedback con widget real, y el comportamiento desde el dominio publicado (P5).


## 2026-11-12 · D26 · P4: artículos en MDX en el portal y bloque en cada herramienta
**Entregado (local, sin publicar nada):** `content/articulos/*.mdx` con datos de cabecera (titulo, fecha, resumen, apps, estado); páginas `/articulos` y `/articulos/<slug>` del portal con comentarios (`hilo = articulo:<slug>`); índice estático `/articulos/indice.json`; componente `ArticulosRelacionados` en `@dcc/comunidad`, usado en la sección 05 del observatorio; plantilla `ejemplo-borrador.mdx`.

**Diseño que conviene recordar:**
- MDX con `@next/mdx` (plugins como texto, requisito de Turbopack): `remark-gfm` (tablas) y `remark-frontmatter` + `remark-mdx-frontmatter`. Estilos en `apps/portal/mdx-components.tsx` con los tokens de la marca; sin plugin de tipografía.
- **Un artículo mal escrito rompe el build** (`lib/articulo-meta.ts`): fecha inválida, estado desconocido, app desconocida o nombre de archivo fuera de formato. El nombre del archivo (la dirección) admite hasta 40 caracteres, porque el evento `abrir_articulo:<slug>` del servidor no acepta más y descartaría el lote entero.
- **Borradores:** solo se ven al desarrollar (`NODE_ENV !== production`). En producción no figuran en la lista, ni en el índice, ni en los metadatos, y su contenido no se envía. Verificado compilando y sirviendo en producción: índice vacío, lista «Aún no hay artículos publicados», y el borrador no filtra su texto.
- **Limitación conocida:** una dirección de artículo inexistente (o un borrador en producción) muestra la página 404 con `noindex` pero con estado HTTP 200, porque la respuesta ya empezó a enviarse (caché de componentes). No filtra contenido; pendiente de revisar si importa para buscadores.
- `ArticulosRelacionados` lee el índice del portal (mismo dominio, sin costo de función) y, solo si hay artículos de esa app, pide los conteos de comentarios en una llamada. Descarta lo que no encaje con la forma esperada (un `slug` con forma de ruta nunca llega a un enlace). Sin índice (herramienta abierta sola, fuera del portal) no muestra nada. El enlace es un `<a>` común porque el artículo vive en otra zona.
- Con la caché de componentes, `generateStaticParams` no puede ir vacío: si no hay artículos publicados se declara una ruta inexistente que responde 404.

**Verificación (local):** 25 pruebas nuevas de la validación y 11 de `leerIndice` (en total, 25 del portal, 40 de `@dcc/comunidad`, 52 de `supabase`); lint, tipos y build de portal y seguridad sin errores; `npm audit` de producción sin vulnerabilidades. Pruebas de mutación: con el filtro de borradores roto falla 1 prueba y con el estado sin validar fallan 2. Navegador (desarrollo): lista y artículo con el borrador y su etiqueta, tabla sin desborde a 375 px, comentarios del artículo, y en el observatorio (visto por el portal) el bloque «Artículos sobre esta herramienta» con enlace `/articulos/ejemplo-borrador`, resumen y «Comentarios (1)» desplegable.
**No verificado:** con el dominio publicado (P5), con un artículo real publicado de extremo a extremo, accesibilidad con axe de las páginas nuevas, ni el evento `abrir_articulo` enviado al servidor real.
**Pendiente del autor:** escribir los artículos reales; el borrador solo es una plantilla.


## 2026-11-12 · D27 · Observatorio: selección en 3D, araña por delito, filtro «Todos» y modo comparar
**Entregado (local, sin publicar):** al seleccionar un municipio el mapa lo «levanta» (capa `fill-extrusion` de MapLibre, altura proporcional al tamaño del municipio y a su percentil de tasa), inclina la cámara y atenúa el resto. Una tarjeta muestra una **araña con un eje por tipo de delito** (percentil de la tasa por 100 mil frente a los demás municipios) y los valores reales. El botón «Comparar con otro municipio» superpone dos arañas, dibuja una línea entre ambos municipios con su distancia, y escribe una lectura en palabras (quién tiene más tasa y en qué delito ocurre lo contrario). El filtro de delito tiene la opción **«Todos los delitos»**, que es la inicial.

**Decisiones de diseño:**
- Se descartó una araña con ejes «cambio / agrupación / semanas atípicas»: los dos últimos casi siempre quedaban en cero y no decían nada al lector. Esos datos van como texto bajo la araña.
- Con «Todos los delitos» se suman conteos, serie semanal y la mediana del pronóstico. **No** se suman los intervalos del pronóstico, ni las semanas atípicas por municipio, ni los puntos calientes (Gi*): se calculan por tipo de delito y sumarlos no tendría sentido; la interfaz lo dice («Puntos calientes: —, elija uno»). Con «Todos» el pronóstico de un municipio es el de su departamento, porque un municipio solo tiene pronóstico propio para algunos delitos y la suma quedaría incompleta.
- Las semanas atípicas recientes con «Todos» mezclan delitos y cada fila indica el suyo.
- El perfil carga los conteos de los 6 delitos solo cuando hay un municipio seleccionado (6 consultas pequeñas a los parquet en el navegador).
- Con «reducir movimiento» activo en el sistema no hay vuelo ni animación de altura.
- **No se agregó un evento de analítica** para «comparar»: el servidor valida los nombres de evento y hacerlo exige volver a desplegar `dcc-comunidad`. Queda como mejora posible.

**Verificación (local):** 18 pruebas nuevas (`lib/perfil.test.ts`: percentiles, altura, distancia, frase de comparación, casos con ceros y pocas denuncias); tipos y lint sin errores; en el navegador, con «Todos» y con Homicidio: selección, comparación Amalfi–Tesalia (línea, distancia, dos arañas, tabla) y cambio de delito con la comparación abierta, sin errores de consola.
**Celular (emulado a 375 px, 2026-11-12):** sin desborde horizontal; la tarjeta pasa debajo del mapa; en pantallas angostas el bloque 3D mide ~55 % y la cámara se inclina 42° (a 56° tapaba casi todo el mapa).
**Accesibilidad (axe-core 4.10, tarjetas de perfil y comparación abiertas):** hallazgos corregidos: texto de color en las cabeceras de la tabla comparativa con contraste insuficiente (ahora texto oscuro con barra de color), tarjetas como `aside` anidado (ahora `role=group`) y una lista de definiciones con un `dt` sin `dd`. Resultado final: 0 violaciones en las tarjetas; «contraste» sigue como incompleta por el fondo en degradado (mismo caso de D17). El registro del panel de eventos de desarrollo ganó foco por teclado.
**No verificado:** toques y zoom con pellizco en un celular real; rendimiento de la extrusión en móviles de gama baja; el modo comparar con enlace compartible (no se guarda en la dirección todavía).


## 2026-11-12 · D28 · P5: publicación en Vercel (en curso)
**Hecho (con confirmación del autor en cada paso):** push de 19 commits a `main` (revisados sin secretos; el CI pasó). Proyectos de Vercel `dcc-seguridad` (raíz `apps/seguridad`) y `dcc-portal` (raíz `apps/portal`) en el equipo del autor (Hobby), conectados al repositorio, Node 22, «incluir archivos fuera de la raíz» activado, protección de Vercel desactivada (el portal reenvía `/seguridad` al otro proyecto y no puede pasar por un login). Variables: URLs públicas de la función (`NEXT_PUBLIC_COMUNIDAD_URL`, `NEXT_PUBLIC_EVENTOS_URL`) en ambos, `ZONA_SEGURIDAD_URL=https://dcc-seguridad.vercel.app` en el portal, y la Site key de Turnstile cargada por el autor en ambos (solo Production). Primer despliegue de ambos a producción.

**Hallazgo:** `dcc-portal.vercel.app` ya pertenece a otra cuenta de Vercel (redirige a un login ajeno). El portal quedó en `https://dcc-portal-five.vercel.app`. El widget de Turnstile y `DCC_ORIGENES` confiaban en el dominio ajeno: el autor los cambió al dominio nuevo (y quitó el ajeno). Primero el redespliegue de la función no bastó porque el secreto aún no estaba guardado; tras guardarlo, la función acepta el dominio nuevo (204) y rechaza el ajeno y `dcc-seguridad.vercel.app` (403).
**Herramientas:** el conector de Vercel de esta sesión no tiene permiso de escritura (403); la creación y configuración de proyectos se hizo con la CLI de Vercel y la sesión del autor.
**Cambio menor en la función:** versión 2 de `dcc-comunidad`; la expresión regular con caracteres invisibles de `logica.ts` pasó a escapes `\uXXXX` (mismo comportamiento; 52 pruebas pasan).

**Verificado en el dominio publicado:** observatorio, portal, `/articulos`, `/seguridad/metodologia`, `/privacidad` y `/sobre-mi` responden 200. Eventos: `vista_app` y `clic_tabla_cambios` llegaron a `dcc_eventos_dia` desde el sitio publicado. Comentario real (Turnstile resuelto por el autor en su Chrome): llegó como `pendiente` con `app_origen=seguridad`; el límite diario quedó como hash de 64 caracteres, sin IP; tras aprobarlo apareció en `GET /comentarios` y en `/conteos` (1). Artículos: el índice sale vacío, la lista dice «Aún no hay artículos publicados» y el borrador de ejemplo responde 404 en producción. Accesibilidad con axe-core 4.10 sobre las seis páginas: 0 violaciones («contraste» queda incompleta por el fondo en degradado, como en D17). Datos de prueba (comentario, eventos y cupo) borrados.
**No verificado aún:** el formulario de feedback con Turnstile real; el 429 del sexto envío; Lighthouse (el servicio gratuito de Google dio 429 por cuota; se usó axe, su motor de accesibilidad); que la ingesta semanal dispare el redespliegue.
**Pendiente:** restringir el CORS de R2 (propuesta en `docs/r2-cors.json`, sin aplicar: el autor la pega en el panel de Cloudflare); crear el deploy hook de `dcc-seguridad` y cargarlo como secreto `VERCEL_DEPLOY_HOOK` en GitHub (el autor, porque la URL es un secreto); decidir el dominio definitivo (al cambiarlo, repetir Turnstile, `DCC_ORIGENES`, `ZONA_SEGURIDAD_URL` y el CORS de R2).
