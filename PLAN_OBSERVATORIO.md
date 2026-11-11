# Plan de implementación — App 1: Observatorio de Seguridad

**Sitio:** *Datos con Criterio*, de Luis E. Romero (dominio previsto: `luiseromero.com`)
**Propósito del sitio:** portafolio que muestra criterio de decisión apoyado en datos abiertos de Colombia y en marcos de gestión de los libros leídos.
**Formato de cada caso:** Libro → Marco → Datos → Hallazgo → Recomendación.

---

## 1. Objetivo de esta app

Construir, de punta a punta y con actualización automática, un observatorio de delitos en Colombia que:

1. **Describa**: evolución, estacionalidad y tasas por 100 000 habitantes por municipio y tipo de delito.
2. **Pronostique**: delitos por municipio y semana para las próximas 8 semanas, con intervalos de confianza.
3. **Detecte**: puntos calientes espaciales (Getis-Ord Gi*) y semanas anómalas.
4. **Simule**: asignación de recursos de vigilancia entre municipios de un departamento (optimización en el navegador).
5. **Recomiende**: un memo ejecutivo con estructura de pirámide (Minto), con hallazgos y límites.

**Éxito =** sitio público con datos que se actualizan solos cada semana, modelo con *backtest* documentado y mejor que la línea base, y memo ejecutivo publicado.

## 2. Alcance

**Dentro (MVP):**
- Cobertura nacional a nivel **municipio** (no hay coordenadas a nivel nacional).
- Delitos: homicidio, lesiones personales, hurto a personas, hurto a comercio, hurto a residencias, hurto de motos, hurto de vehículos (ajustar según lo que esté vigente en datos.gov.co).
- Histórico desde 2015 (o lo que haya disponible y sea consistente).

**Fuera (fases posteriores):**
- Detalle intramunicipal de Bogotá (localidades/UPZ) y Medellín (comunas).
- Cruce con Medicina Legal.
- Cualquier dato no público (en especial nada de G4S ni de clientes).

## 3. Principios y decisiones de arquitectura

| Decisión | Por qué |
|---|---|
| Todo por lotes (*batch*), sin servidor de modelos | Los datos cambian semanal o mensualmente; costo 0 USD |
| Parquet + DuckDB-WASM en el navegador | Consultas interactivas sin base de datos ni backend |
| GitHub Actions como motor de cómputo | Gratis e ilimitado en repo público; 4 vCPU / 16 GB |
| Cloudflare R2 para datos | 10 GB gratis, sin cobro por descarga; GitHub limita a 100 MB por archivo |
| Repo **público** | El código también es portafolio |
| Sin APIs de IA pagas | Preferencia del autor; los textos los escribe él |
| Código DIVIPOLA como llave universal | Los nombres de municipios vienen escritos distinto en cada fuente |
| No publicar nunca datos que no pasen las validaciones | Credibilidad |

## 4. Fuentes de datos (verificar en la Fase 0)

| Fuente | Uso | Notas |
|---|---|---|
| datos.gov.co — Policía Nacional (SIEDCO), conjuntos por delito | Hechos | API Socrata (SoQL). Requiere *app token* gratis. Verificar ID, vigencia y última fecha de cada conjunto |
| DANE — proyecciones de población municipal | Tasas por 100 000 hab. | Por año y municipio |
| DANE — Marco Geoestadístico Nacional (MGN) | Polígonos municipales | Convertir a PMTiles/GeoJSON simplificado; pesos espaciales para Gi* |
| DIVIPOLA (DANE) | Catálogo de municipios | Tabla maestra de normalización |

**Problemas de datos esperados (documentarlos en el sitio):**
- **Registro tardío:** las últimas semanas suelen estar incompletas y se corrigen después → marcar o excluir las últimas *N* semanas (determinar *N* empíricamente comparando cargas sucesivas).
- **Subregistro:** los datos miden denuncias, no delitos reales.
- **Cambios de esquema** entre años o conjuntos (nombres de columnas, categorías de armas o modalidades).
- **Municipios pequeños** con series casi siempre en cero (series intermitentes).

## 5. Arquitectura y flujo

```
GitHub Actions (cron)
  ingesta.yml   (semanal, lunes)  → API datos.gov.co → bronze/ (Parquet crudo, incremental por fecha)
                                  → transformación DuckDB → silver/ → gold/
                                  → validaciones pandera  → si fallan: se detiene y abre issue
                                  → predicción con el modelo vigente → gold/predicciones/
                                  → sube gold a R2 → deploy hook de Vercel
  modelos.yml   (mensual)         → reentrena + backtest → models/artifacts + metrics.json + ficha
  ci.yml        (cada PR/push)    → lint, pruebas, build del sitio

Cloudflare R2 (bucket público de solo lectura, CORS para el dominio)
  bronze/  silver/  gold/  models/

Vercel (Next.js, plan Hobby)
  DuckDB-WASM lee gold/*.parquet → ECharts + MapLibre/PMTiles → HiGHS (WASM) para el simulador
```

### Capas de datos
- **bronze:** respuesta de la API tal cual, particionada por `fuente/año/mes`.
- **silver:** tipos limpios, fecha del hecho, `cod_mpio` DIVIPOLA, delito normalizado, sin duplicados.
- **gold (lo que lee el sitio; objetivo < 30 MB en total):**
  - `hechos_semana_mpio.parquet`: semana × municipio × delito → conteo, tasa.
  - `hechos_mes_mpio.parquet`: lo mismo, mensual (más liviano para la vista nacional).
  - `predicciones.parquet`: semana futura × municipio × delito → p50, p10, p90.
  - `hotspots.parquet`: municipio × delito × periodo → z-score Gi*, p-valor, categoría.
  - `anomalias.parquet`: semana × municipio × delito → valor, esperado, puntaje.
  - `municipios.parquet`: DIVIPOLA, nombre, departamento, población, centroide.
  - `metadatos.json`: fecha de corte, fecha de actualización, versión del modelo, métricas.

## 6. Modelos

### 6.1 Pronóstico semanal (núcleo)
- **Unidad:** municipio × delito × semana ISO.
- **Líneas base obligatorias:** *seasonal naive* (52 semanas) y media móvil de 4 semanas.
- **Candidatos:**
  - `statsforecast`: AutoETS / AutoTheta para series con volumen; Croston/TSB para series intermitentes.
  - `mlforecast` + LightGBM como modelo global (rezagos, medias móviles, semana del año, festivos de Colombia, quincenas).
- **Segmentación:** pronosticar a nivel municipal solo donde haya volumen suficiente (umbral definido en el EDA); el resto agregado por departamento.
- **Intervalos:** conformales (p10/p90).
- **Evaluación:** *backtest* con origen rodante (por ejemplo, 12 cortes, horizonte de 8 semanas). Métricas: **WAPE** y **MASE**, más cobertura de los intervalos. Nunca validación aleatoria.
- **Criterio de aceptación:** mejorar la línea base en WAPE agregado y en la mayoría de los delitos; si no, publicar la línea base y explicarlo (también es un hallazgo).
- **Ficha del modelo** (`models/FICHA_PRONOSTICO.md`): qué predice, datos, periodo, métricas, límites, sesgos (subregistro), uso indebido.

### 6.2 Puntos calientes
- Getis-Ord Gi* (`esda` + `libpysal`) sobre tasas municipales, con pesos espaciales de contigüidad (Queen) a partir del MGN.
- Ventanas: últimos 12 meses frente a los 12 anteriores → emergente / persistente / en disminución.
- Corrección por comparaciones múltiples (FDR).

### 6.3 Anomalías
- Residuo estandarizado frente al pronóstico (o STL robusto) → semanas con |z| > 3.
- En el sitio: "semanas atípicas" con contexto, sin sensacionalismo.

### 6.4 Simulador de asignación (optimización, no ML)
- Problema: repartir *R* unidades de vigilancia entre los municipios de un departamento para maximizar la reducción esperada de delitos, con **rendimientos decrecientes** (función cóncava linealizada por tramos) y mínimos y máximos por municipio.
- Entrada: pronóstico p50 + supuesto de efectividad ajustable por el usuario.
- Solver: HiGHS compilado a WebAssembly (`highs` en npm), en el navegador.
- **Advertencia visible:** es ilustrativo; el efecto de la vigilancia es un supuesto, no una estimación causal.

## 7. El sitio (shell + página de esta app)

- **Stack:** Next.js (App Router, TypeScript), Tailwind, `@duckdb/duckdb-wasm`, ECharts, MapLibre GL + PMTiles, `highs`.
- **Rutas iniciales:**
  - `/`: portada de *Datos con Criterio* (propuesta, casos, lecturas, sobre mí).
  - `/casos/observatorio-seguridad`: la app.
  - `/casos/observatorio-seguridad/metodologia`: fuentes, limpieza, modelos, ficha, límites.
  - `/sobre-mi`.
- **Página de la app, en orden:**
  1. Memo ejecutivo arriba (3–5 frases: idea principal + 3 argumentos), con fecha de corte.
  2. Filtros: delito, departamento, municipio, periodo.
  3. Mapa coroplético de tasas + capa de puntos calientes.
  4. Serie temporal con histórico + pronóstico e intervalo.
  5. Tabla de municipios con mayor cambio y semanas anómalas.
  6. Simulador de asignación.
  7. Marco del libro aplicado (Minto para el memo; agregar otro libro si encaja).
  8. Etiqueta "Datos actualizados al AAAA-MM-DD" + enlace a la metodología y al código.
- **Requisitos:** funciona en celular (16 px de margen, sin scroll horizontal), modo claro/oscuro, accesibilidad (Lighthouse ≥ 95), carga inicial < 3 s (cargar DuckDB-WASM de forma diferida).

## 8. Estructura del repositorio

```
datos-con-criterio/
├── PLAN_OBSERVATORIO.md
├── README.md
├── pyproject.toml            # uv; Python 3.12
├── pipelines/
│   ├── common/               # cliente Socrata, R2 (boto3/S3), DIVIPOLA, logging
│   └── seguridad/
│       ├── ingesta.py
│       ├── transformar.sql / transformar.py
│       ├── validaciones.py   # esquemas pandera
│       └── publicar.py
├── models/
│   └── seguridad/
│       ├── entrenar.py
│       ├── backtest.py
│       ├── predecir.py
│       ├── hotspots.py
│       ├── anomalias.py
│       └── FICHA_PRONOSTICO.md
├── notebooks/                # EDA (Jupyter), enlazados desde la metodología
├── tests/                    # pytest: normalización DIVIPOLA, validaciones, métricas
├── docs/
│   ├── fuentes.md            # IDs de los conjuntos, vigencia, latencia, esquema
│   └── decisiones.md         # registro de decisiones (ADR breve)
├── site/                     # Next.js
├── data/                     # SOLO local, en .gitignore
└── .github/workflows/        # ci.yml, ingesta.yml, modelos.yml
```

## 9. Fases y criterios de aceptación

Cada fase termina con un commit; nada se publica sin aprobación del autor.

### Fase 0 — Preparación y verificación de fuentes
- Crear la estructura del repo, `uv`, `.gitignore`, README básico.
- Encontrar en datos.gov.co los conjuntos de SIEDCO vigentes: ID, columnas, rango de fechas, frecuencia de actualización y volumen. Igual para población DANE, MGN y DIVIPOLA.
- **Entregable:** `docs/fuentes.md`.
- **Aceptación:** el autor revisa las fuentes y confirma el alcance (delitos y años) antes de seguir.

### Fase 1 — Ingesta y transformación (local)
- Cliente Socrata con paginación, reintentos e incremental por fecha; token desde variable de entorno.
- bronze → silver → gold con DuckDB; normalización DIVIPOLA con prueba unitaria.
- EDA en notebook: volumen, registro tardío (estimar *N*), cambios de esquema, intermitencia.
- **Aceptación:** gold local generado; los totales anuales cuadran con los publicados por la fuente (±1 %); pruebas en verde.

### Fase 2 — Calidad y automatización
- Esquemas pandera + reglas de volumen (caída > 50 % semana contra semana = alerta).
- Workflows `ci.yml` e `ingesta.yml` (con `workflow_dispatch` para correr a mano).
- Subida a R2 y configuración de CORS.
- **Aceptación:** una corrida manual en GitHub Actions deja gold en R2; una validación forzada a fallar abre un issue y no publica.
- **Vía MCP (Claude, con confirmación del autor en cada acción):** crear el repo en GitHub, el bucket de R2 y su CORS en Cloudflare, el proyecto en Vercel y su *deploy hook*.
- **Requiere del autor:** crear el token de datos.gov.co y las claves de acceso de R2, y cargarlos como *secrets* de GitHub (Claude no maneja valores de credenciales).
- **Supabase** (también conectado por MCP): no se usa en esta app. Es un proyecto compartido con ROMI y Lector; si alguna vez se usa, solo con objetos nuevos con prefijo `dcc_`.

### Fase 3 — Pronóstico
- Líneas base, candidatos, *backtest*, selección, intervalos, ficha del modelo.
- `modelos.yml` mensual; `predecir.py` dentro de la ingesta semanal.
- **Aceptación:** `metrics.json` con WAPE/MASE por delito frente a la línea base; ficha completa; predicciones en gold.

### Fase 4 — Puntos calientes y anomalías
- Gi* con FDR; categorías emergente/persistente/en disminución; anomalías.
- **Aceptación:** resultados en gold; revisión manual de 5 casos con sentido.

### Fase 5 — Sitio y página del observatorio
- Shell de *Datos con Criterio* + página de la app (secciones 1–5 y 8 del punto 7).
- PMTiles de municipios; DuckDB-WASM leyendo desde R2.
- **Aceptación:** despliegue en una URL `*.vercel.app`; funciona en celular; Lighthouse accesibilidad ≥ 95; los filtros responden en < 1 s después de la carga.

### Fase 6 — Simulador de asignación
- Modelo de optimización con HiGHS-WASM, controles y advertencia.
- **Aceptación:** con R = 0 no cambia nada; con R alto respeta los máximos; resuelve un departamento grande en < 1 s.

### Fase 7 — Memo, metodología y lanzamiento
- El autor redacta el memo (Minto) con el apoyo de los hallazgos; página de metodología; enlace al repo.
- Conectar el dominio (`luiseromero.com`) cuando el autor lo compre.
- **Aceptación:** el autor aprueba el texto; la ingesta semanal corre sola dos semanas seguidas sin intervención.

## 10. Costos

| Pieza | Costo |
|---|---|
| GitHub (repo público + Actions) | 0 |
| Cloudflare R2 (< 10 GB) | 0 |
| Vercel Hobby | 0 |
| Token de datos.gov.co | 0 |
| Dominio `luiseromero.com` | ~12 USD/año |

## 11. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Un conjunto deja de actualizarse o cambia de ID | Monitor de frescura en la ingesta; `docs/fuentes.md` con alternativas |
| Registro tardío distorsiona las últimas semanas | Excluir o marcar las últimas *N* semanas; explicarlo en la metodología |
| Interpretación sensacionalista o estigmatizante de municipios | Usar tasas, intervalos y lenguaje neutro; sección de límites |
| El modelo no supera la línea base | Publicar la línea base y explicarlo; es un resultado válido |
| Datos más grandes de lo previsto en el navegador | Agregación mensual para la vista nacional; carga diferida por departamento |
| Alcance que crece | Respetar el MVP; lo demás va a la sección "Fuera" |

## 12. Estado

- [x] Fase 0 · [~] Fase 1 (gold local listo; falta EDA/registro tardío, ver docs/decisiones.md) · [x] Fase 2 (Vercel y su deploy hook pasan a la Fase 5, ver docs/decisiones.md) · [x] Fase 3 (local; falta correr modelos.yml en Actions) · [ ] Fase 4 · [ ] Fase 5 · [ ] Fase 6 · [ ] Fase 7
