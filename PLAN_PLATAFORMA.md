# Plan — Plataforma *Datos con Criterio*: varias apps, artículos, comentarios, analítica

Escrito el 2026-11-12 para implementarse con Claude Sonnet. Revisado el 2026-11-12 con el autor: identidad visual azul (2.8) y reorientación aplazada como app futura (3). Complementa `PLAN_OBSERVATORIO.md`, que sigue siendo la fuente de verdad del caso 1.
Las decisiones marcadas **[CONFIRMAR]** las aprueba el autor antes de empezar la fase que las usa.

---

## 0. Qué pidió el autor

1. Capturar las **visitas** al sitio y la **interacción** con cada app.
2. Varias apps en la misma web, pero cada una en **su propio proyecto de Vercel**; la web principal tiene «Sobre mí».
3. **Feedback** y **comentarios**.
4. **Artículos** (uno o varios por app), anexos y no parte de la app; configurables en todas las apps.
5. Comentarios por artículo, visibles **en la app** y en la **sección de artículos de la web principal**.
6. Opinión sobre reorientar la app hacia utilidades más visitadas (ideas de Gemini). **Decisión del autor: se aplaza; será otra app con su propio plan.**
7. Si hace falta base de datos: el proyecto Supabase de ROMI (`romi-app`, ref `emkinfqdwjtzkkyabmyb`, sa-east-1), porque no hay cupo para uno nuevo.
8. Identidad visual propia, en blanco y azules, común a todas las apps.

### Decisiones a validar por el autor

| # | Decisión | Estado |
|---|---|---|
| 1 | Multi-zonas (un proyecto de Vercel por app, un solo dominio) en lugar de iframes | Por validar |
| 2 | Supabase en `romi-app` solo con objetos `dcc_`, todo a través de la función `dcc-comunidad` | Por validar |
| 3 | Visitas con Cloudflare Web Analytics + interacción con eventos propios agregados por día | Por validar |
| 4 | Ficha municipal y Radar SECOP | **Aplazado: app futura** |
| 5 | Identidad visual azul (Archivo + Martian Mono), común a todas las apps | Aplicada en el sitio local; por validar |

---

## 1. Hechos verificados que condicionan el diseño

| Hecho | Fuente | Consecuencia |
|---|---|---|
| Vercel Web Analytics en Hobby: **50 000 eventos/mes compartidos entre todos los proyectos** de la cuenta, **sin eventos personalizados**, ventana de 1 mes; al pasarse, se pausa la recolección | vercel.com/docs/analytics/limits-and-pricing (actualizado 2026-08-25) | No sirve para medir interacción. Y compartiría cupo con Lector, ROMI e INDI. |
| Cloudflare Web Analytics: gratis; **no usa cookies ni almacenamiento local para rastrear y no identifica por IP**; eventos personalizados **solo como plan a futuro** (no hay evidencia de que existan). Límite: 10 sitios si no pasan por el proxy de Cloudflare. La doc oficial de límites no dice nada de retención ni de muestreo | Artículo oficial de Cloudflare (2020) y developers.cloudflare.com/web-analytics/limits | Sirve para visitas, no para interacción. La retención es **desconocida**; no se promete. |
| Next.js 16 soporta **multi-zonas**: apps Next independientes servidas bajo un mismo dominio con `rewrites` + `assetPrefix`; entre zonas se navega con `<a>`, no con `<Link>` | `site/node_modules/next/dist/docs/01-app/02-guides/multi-zones.md` | Cada app puede ser su propio proyecto de Vercel sin perder un dominio único. |
| Supabase: hay dos proyectos, `INDI_App` y `romi-app` (los 2 gratuitos que permite el plan) | MCP de Supabase, `list_projects` (solo lectura) | Se usará `romi-app`, solo con objetos `dcc_`. |
| **`romi-app` hoy: 13 MB de 500 MB, 19 tablas públicas (todas con RLS), 0 objetos `dcc_`, 0 Edge Functions** | `list_tables`, `list_edge_functions` y una consulta de solo lectura | Sin choques de nombres; hay holgura de sobra. |
| Supabase gratuito: **500 000 invocaciones de Edge Functions al mes, compartidas por toda la organización**; 500 MB de base por proyecto; 5 GB de salida; las peticiones OPTIONS no se cobran | supabase.com/docs/guides/functions/pricing y billing-on-supabase | Presupuesto de eventos: ver 2.5. Al superar la cuota hay aviso y periodo de gracia, no cobro. |
| **Supabase pausa los proyectos gratuitos con poca actividad en 7 días** (se pueden restaurar hasta 90 días después) | supabase.com/docs/guides/platform/free-project-pausing | Riesgo real: si `romi-app` se pausa, comentarios y eventos dejan de funcionar. Todo el cliente debe **degradar sin romper la app** (P3). Nuestra propia actividad ayuda a mantenerlo vivo. |
| Cloudflare Turnstile gratis: hasta 20 widgets, 10 hostnames por widget, desafíos ilimitados. La doc no dice si pide método de pago (la cuenta ya tiene uno por R2) | developers.cloudflare.com/turnstile/plans | Alcanza de sobra. |
| **Línea base de seguridad de `romi-app`: 15 avisos que ya existían** (4 funciones con `search_path` mutable, 5 funciones `SECURITY DEFINER` ejecutables por `anon`, 5 por `authenticated`, 1 por protección de contraseñas filtradas desactivada) | `get_advisors` (seguridad), 2026-11-12 | Son de ROMI y **no se tocan**. El criterio de P3 es «ningún aviso nuevo» frente a esta línea base. |

**Verificado en P0 el 2026-11-12** (detalle en `docs/decisiones.md`, D18). Quedan sin verificar: la retención de datos de Cloudflare Web Analytics y si Turnstile exige método de pago.

---

## 2. Decisiones de arquitectura

### 2.1 Varias apps: multi-zonas, no iframes **[CONFIRMAR]**

El autor pidió «webs independientes que se embeben». Recomiendo **multi-zonas** en lugar de iframes:

| | Multi-zonas (recomendado) | Iframe |
|---|---|---|
| Independencia (repo, deploy, fallos) | Total: un proyecto de Vercel por app | Total |
| Una sola dirección (`luiseromero.com/seguridad`) | Sí | La URL del iframe no se ve ni se comparte |
| Celular, alto de página, accesibilidad, SEO | Normales | Problemas de alto, foco y SEO; Google indexa la otra URL |
| Analítica | Directa | Hay que pasar eventos entre ventanas |

Diseño:
- `dcc-portal` (proyecto Vercel): la web principal. Portada, casos, **artículos**, «Sobre mí», privacidad. Es la zona por defecto.
- `dcc-seguridad` (proyecto Vercel): el observatorio, con `basePath: "/seguridad"`. El portal reescribe `/seguridad/:path*` hacia el dominio de `dcc-seguridad`.
- Cada app futura (p. ej. `dcc-secop`) es otra zona: un proyecto nuevo y una línea de `rewrites` en el portal.
- Mientras no se compre `luiseromero.com`, el portal vive en `dcc-portal.vercel.app` y las reescrituras apuntan a `dcc-seguridad.vercel.app`.
- **Iframe solo como extra**: una ruta `/embed` en cada app (vista compacta) para incrustarla en sitios de terceros si algún día hace falta.

### 2.2 Estructura del repositorio: monorepo con espacios de trabajo npm

```
datos-con-criterio/
├── apps/
│   ├── portal/            # Next.js: portada, /articulos, /sobre-mi, /privacidad (zona por defecto)
│   └── seguridad/         # el sitio actual (hoy en site/), con basePath /seguridad
├── packages/
│   ├── marca/             # tokens CSS, fuentes, encabezado y pie comunes (enlaces entre zonas con <a>)
│   └── comunidad/         # Comentarios, Feedback, ArticulosRelacionados, cliente de la API, track()
├── content/articulos/     # artículos en MDX (los publica el portal)
├── supabase/
│   ├── migrations/        # SQL de los objetos dcc_ (versionado, revisable)
│   └── functions/dcc-comunidad/  # Edge Function única de la plataforma
├── pipelines/  models/  tests/  docs/   # igual que hoy
└── package.json           # workspaces: apps/*, packages/*
```

- Cada proyecto de Vercel apunta a su carpeta (`apps/portal`, `apps/seguridad`) como Root Directory; los paquetes se comparten con `transpilePackages`.
- El repo sigue siendo uno solo y público. Una app futura con su propio pipeline de datos sigue el mismo patrón (`pipelines/<app>`, `models/<app>`).

### 2.3 Datos de la plataforma en Supabase (ROMI) con aislamiento máximo **[CONFIRMAR]**

Reglas que no se negocian:
- Solo **objetos nuevos con prefijo `dcc_`** (tablas, funciones SQL) y la Edge Function **`dcc-comunidad`**. No se tocan tablas, Auth, buckets, políticas ni configuración de ROMI.
- **Ningún frontend de Datos con Criterio usa la clave anon de ROMI.** Todo pasa por la Edge Function `dcc-comunidad`, desplegada con `verify_jwt = false`, que usa internamente la service role (nunca sale de Supabase).
- Las tablas `dcc_` tienen **RLS activado y ninguna política para `anon` ni `authenticated`**. Desde fuera solo se llega a ellas por la función.
- Migraciones en `supabase/migrations/`, aplicadas con el MCP **con confirmación del autor en cada una**. Antes y después de cada migración: `list_tables` para comprobar que solo cambiaron objetos `dcc_`.

Esquema propuesto (borrador para revisar en P3):

```sql
create table public.dcc_comentarios (
  id          uuid primary key default gen_random_uuid(),
  hilo        text not null check (hilo ~ '^(app|articulo):[a-z0-9-]{1,80}$'),  -- 'app:seguridad', 'articulo:mi-slug'
  nombre      text not null check (char_length(nombre) between 2 and 60),
  cuerpo      text not null check (char_length(cuerpo) between 3 and 2000),
  respuesta_a uuid references public.dcc_comentarios(id) on delete cascade,
  estado      text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado')),
  app_origen  text not null,                      -- desde qué app o página se escribió
  creado      timestamptz not null default now()
);
create index dcc_comentarios_hilo on public.dcc_comentarios (hilo, creado) where estado = 'aprobado';

create table public.dcc_feedback (
  id             uuid primary key default gen_random_uuid(),
  app            text not null,
  ruta           text not null,
  tipo           text not null check (tipo in ('error','idea','dato','otro')),
  mensaje        text not null check (char_length(mensaje) between 3 and 3000),
  contacto       text,                             -- opcional; solo con consentimiento
  consentimiento boolean not null default false,
  creado         timestamptz not null default now(),
  check (contacto is null or consentimiento)
);

create table public.dcc_eventos_dia (               -- analítica agregada: sin filas por visitante
  fecha     date not null,
  app       text not null,
  evento    text not null,
  propiedad text not null default '',
  conteo    bigint not null default 0,
  primary key (fecha, app, evento, propiedad)
);

create table public.dcc_limites (                   -- límite de envíos por día; la clave es un hash con sal diaria, no la IP
  clave text not null,
  dia   date not null,
  n     int  not null default 0,
  primary key (clave, dia)
);

alter table public.dcc_comentarios enable row level security;
alter table public.dcc_feedback    enable row level security;
alter table public.dcc_eventos_dia enable row level security;
alter table public.dcc_limites     enable row level security;
-- Sin políticas: anon y authenticated no leen ni escriben. Solo la Edge Function (service role).
```

Por qué así: el tamaño queda acotado (los eventos se guardan **agregados por día**, no uno por clic), no se guarda ninguna IP y la base de ROMI no corre riesgo de llenarse.

### 2.4 Edge Function `dcc-comunidad` (contrato)

| Ruta | Qué hace | Protección |
|---|---|---|
| `GET /comentarios?hilo=…` | Comentarios aprobados del hilo, más recientes primero, paginados | Caché HTTP 60 s |
| `GET /conteos?hilos=a,b,c` | Número de comentarios aprobados por hilo (para listas de artículos) | Caché 60 s |
| `POST /comentarios` | Crea un comentario `pendiente` | Turnstile + campo trampa + límite de 5 envíos por día por origen (hash con sal diaria) + validación de longitudes |
| `POST /feedback` | Guarda feedback privado | Igual que arriba |
| `POST /eventos` | Recibe un lote de hasta 50 eventos y suma conteos en `dcc_eventos_dia` | Lista blanca de apps y eventos, tope por lote, sin Turnstile |

- CORS: solo los orígenes de la plataforma (`*.vercel.app` del autor, `luiseromero.com` cuando exista, `localhost` en desarrollo).
- Secretos de la función (los carga el autor en el panel de Supabase, nunca en el repo ni en el chat): `TURNSTILE_SECRET`, `DCC_SAL_HASH`.
  Aviso: los secretos de Edge Functions son del proyecto, así que también los verían las funciones de ROMI. Es aceptable porque solo protegen el antispam.
- Moderación (MVP): el autor aprueba o rechaza en el Table Editor de Supabase (`estado`). Se puede automatizar más adelante.

### 2.5 Analítica **[CONFIRMAR]**

Recomiendo dos capas, ambas gratuitas y sin cookies:

1. **Visitas: Cloudflare Web Analytics.** El autor ya tiene cuenta de Cloudflare, no consume el cupo compartido de Vercel y no usa cookies, así que no hace falta aviso de consentimiento. Necesita un *site tag*, que es público.
   Alternativa: Vercel Web Analytics, si el autor acepta compartir los 50 000 eventos/mes con sus otras apps.
2. **Interacción: eventos propios** con `track(evento, propiedad?)` del paquete `comunidad`, que agrupa los eventos en lotes cada 10 s y al salir de la página (`sendBeacon`), y los envía a `POST /eventos`.
   - No se guarda ningún dato personal, identificador de visitante ni IP: solo conteos por día, app, evento y propiedad.
   - Lista inicial de eventos del observatorio: `vista_app`, `filtro_delito:<id>`, `filtro_departamento:<cod>`, `filtro_municipio`, `filtro_periodo:<id>`, `clic_mapa`, `clic_tabla_cambios`, `clic_tabla_atipicas`, `ver_metodologia`, `abrir_articulo:<slug>`, `comentario_enviado`, `feedback_enviado`, `error_datos`.
   - El municipio va sin código, para no crear una fila por municipio.
   - **Presupuesto (cuota gratuita: 500 000 invocaciones al mes, de toda la organización):** cada lote de eventos y cada lectura de comentarios cuenta como una invocación.
     Para cuidarla: `track()` envía como máximo 3 lotes por sesión; los comentarios se leen solo cuando el visitante los abre; y hay un interruptor `NEXT_PUBLIC_EVENTOS=off` que apaga el envío sin redesplegar código. Con unas 3 invocaciones por visita, la cuota alcanza para unas 150 000 visitas al mes.
   - Lectura: al inicio con SQL en Supabase. Más adelante, un panel privado como app propia, que también muestra criterio con datos.

### 2.6 Artículos

- Se escriben en **MDX** en `content/articulos/<slug>.mdx` con frontmatter:
  ```yaml
  titulo: "…"
  fecha: 2026-11-20
  resumen: "…"
  apps: [seguridad]        # en qué apps se muestran; puede ser varias o ninguna
  estado: borrador | publicado
  ```
- El **portal** los publica en `/articulos` (lista, filtrable por app) y `/articulos/<slug>`, con sus comentarios (`hilo = articulo:<slug>`).
- El portal genera en el build un índice estático `/articulos/indice.json` (slug, título, fecha, resumen, apps).
- Cada app muestra `<ArticulosRelacionados app="seguridad" />`, que lee el índice. Por estar en el mismo dominio no hay problema de CORS. Muestra cada artículo con su número de comentarios y un desplegable con los comentarios aprobados del artículo (el mismo hilo que en el portal). El enlace al artículo completo usa `<a>`, porque el artículo vive en otra zona: el artículo es **anexo**, no parte de la app.
- Cada app tiene además su hilo general `app:<id>` («Comentarios sobre esta herramienta») y un botón de **feedback** privado.
- Los textos los escribe el autor; Claude solo prepara la plantilla y un artículo de ejemplo marcado como borrador.

### 2.7 Privacidad (Ley 1581 de 2012)

Al recoger nombres en comentarios y, opcionalmente, contactos en el feedback, el portal debe tener `/privacidad`:
- qué se recoge (nombre público del comentario, contacto opcional del feedback, conteos anónimos de uso), para qué, cuánto tiempo y cómo pedir que se borre;
- el consentimiento explícito en el formulario de feedback cuando se deja contacto.

El autor revisa ese texto; no es asesoría legal.

### 2.8 Identidad visual (común a todas las apps) **[CONFIRMAR]**

Ya está aplicada en el sitio local (`site/app/globals.css`, `site/app/layout.tsx`, el mapa y la serie) para validarla viéndola. En P1 se extrae a `packages/marca` y todas las apps la heredan; ninguna app define colores ni fuentes propios.

**Concepto: plano técnico.** Papel blanco azulado con una retícula apenas perceptible, tinta marina, cobalto como color de marca y un único color de señal (ámbar) reservado para alertas.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--paper` | `#f7f9fc` | `#06101d` | Fondo |
| `--paper-2` | `#e9f0f9` | `#0c1a2d` | Paneles, memo |
| `--ink` | `#0b1f3a` | `#e7eef9` | Texto, líneas guía, serie observada |
| `--ink-2` | `#465a76` | `#9fb2cc` | Texto secundario |
| `--rule` | `#c8d5e8` | `#1e3352` | Bordes |
| `--accent` | `#1f45c4` | `#86a8ff` | Marca (cobalto), enlaces, foco |
| `--forecast` | `#0b72a8` | `#5cc6ee` | Pronóstico, disminuciones |
| `--senal` | `#9a4508` | `#f5b544` | Texto de alerta (aumentos, atípicas altas) |
| `--senal-viva` | `#f59e0b` | `#f5b544` | Marcas gráficas de alerta |

- **Contraste verificado (WCAG AA ≥ 4,5):** todo el texto pasa sobre papel y panel en ambos temas. El mínimo es `--forecast` sobre panel claro, con 4,59. Lighthouse de accesibilidad da 100 en portada y observatorio.
- **Mapa:** rampa secuencial azul de 6 tonos. Claro: `#eef4fb → #0b2a6b`. Oscuro: `#0d1b2e → #cfe4ff`, se ilumina hacia los valores altos.
  Los contornos de puntos calientes llevan **halo** (línea ancha marina u oscura debajo y línea de color encima), porque ningún color único contrasta con todos los tonos de una rampa azul:
  - persistente: blanco grueso;
  - emergente: ámbar;
  - en disminución: blanco fino.
  - La selección va en cian `#22d3ee`.
- **Tipografía:**
  - **Archivo** (Omnibus-Type, fundición argentina), variable en ancho y peso. Titulares expandidos al 118 % y peso 800; texto al ancho normal; cifras grandes al 112 % con números tabulares.
  - **Martian Mono** para etiquetas técnicas y números pequeños.
  - Reemplaza la combinación serif + IBM Plex de la primera versión, que se parecía demasiado al estilo de Claude.
- **Logotipo provisional:** cuadro cobalto + «Datos **con** Criterio», con «con» en cobalto y peso normal. Un logotipo definitivo queda para cuando haya dominio.
- **Reglas para apps nuevas:** usar solo los tokens; el ámbar solo para alertas; los gráficos leen los colores de las variables CSS (cambian solos con el tema); nada de degradados ni sombras decorativas.

---

## 3. Reorientación hacia utilidades — **aplazado: será otra app**

El autor decidió dejar esta línea para después, como una app nueva con su propio plan (`PLAN_<APP>.md`, empezando por su Fase 0 de verificación). Se conserva el análisis para entonces. **Nada de esta sección se implementa en las fases de este plan.**

**Dónde tiene razón la idea.** Una herramienta que responde una pregunta concreta del usuario («¿cómo está mi municipio?», «¿qué licitaciones hay para lo que hago?») trae visitas recurrentes y se comparte; un observatorio solo se visita una vez.

**Dónde no la seguiría tal cual.** Varias afirmaciones de las ideas no están verificadas o chocan con lo que ya sabemos:
- **Radiografía de cuadra:** el SIEDCO nacional no trae coordenadas; lo comprobamos en la Fase 0. Llegar a la cuadra exige datos geolocalizados de Bogotá que no he verificado que existan en abierto.
  Además, puntuar cuadras para decisiones de vivienda tiene un riesgo real de estigmatizar barrios, y el plan del observatorio lo pone como límite.
  Es la más vistosa, pero también la de más riesgo de datos y de reputación.
- **Radar SECOP:**
  - «Lenguaje natural» implica IA de pago, y el autor la descartó. Se resuelve con búsqueda por palabras clave, sinónimos y códigos UNSPSC.
  - «RuleX Data API / MCP» no lo conozco y no lo pude verificar. No se usa nada sin verificar.
  - «Sin base de datos, en vivo» choca con los límites de la API de datos.gov.co; hace falta caché.
- **FincaVigía y Termómetro de flota:** útiles, pero lejos del objetivo del autor (perfil Director/VP) y con datos dispersos.
- «MVP en un fin de semana» es optimista para cualquiera de las cuatro con el nivel de calidad que ya tiene este repo.

**Propuesta (para cuando se retome): no reemplazar, sumar una capa de utilidad a cada caso.**
1. **Observatorio → «Ficha de mi municipio»**: buscador de municipio y una ficha compartible en `/seguridad/municipio/<cod>`. Muestra:
   - tasas frente al departamento y al país;
   - tendencia y pronóstico;
   - comparación con municipios de tamaño parecido, con intervalos y lenguaje neutro.
   Reusa todo lo hecho: es la versión municipal y honesta de la «radiografía», sin pretender llegar a la cuadra.
2. **App 2 = Radar SECOP** (sube en la lista; ya estaba como «Auditor SECOP» en la hoja de ruta). Es la que mejor combina uso frecuente, utilidad B2B y criterio de nivel directivo: quién gana, a qué precio, qué entidades pagan rápido.
   Empieza con su propia **Fase 0 de verificación** (conjuntos de SECOP II vigentes, columnas, límites de la API) y un plan propio, como el del observatorio.
3. Cada app mantiene la estructura **utilidad + artículo de análisis**: la utilidad trae visitas y el artículo muestra criterio. Eso conecta directamente con los artículos de 2.6.

---

## 4. Fases para Sonnet

Reglas de siempre: español; una fase a la vez; verificar los criterios ejecutando pruebas; commit local por fase; marcar el estado al final de este archivo; **confirmación del autor antes de cada acción hacia afuera** (push, crear o cambiar proyectos de Vercel, migraciones o funciones en Supabase, cambios en Cloudflare); sin manejar valores de credenciales; registrar decisiones en `docs/decisiones.md`.

### P0 — Verificaciones y decisiones (sin cambios)
- Leer, sin modificar nada:
  - en `romi-app`: tamaño de la base frente al plan gratuito, nombres de tablas para descartar choques con `dcc_`, y si existen Edge Functions;
  - límite gratuito de invocaciones de Edge Functions;
  - Turnstile gratis;
  - límites oficiales de Cloudflare Web Analytics.
- Presentar al autor las decisiones **[CONFIRMAR]** de este plan (2.1, 2.3, 2.5, 2.8) y esperar su respuesta.
- **Aceptación:** `docs/decisiones.md` con las cifras verificadas y las respuestas del autor.

### P1 — Monorepo y multi-zonas (local)
- Mover `site/` a `apps/seguridad` con `basePath: "/seguridad"`. Ajustar las rutas estáticas (`/seguridad/data/municipios.geojson`, `/seguridad/vendor/maplibre/…`) y `scripts/copiar-worker.mjs`. El worker de MapLibre debe resolverse con el `basePath`.
- Crear `apps/portal`: portada (lista de casos), `/sobre-mi` (pendiente del autor), `/privacidad` (borrador para el autor), `/articulos` (vacío por ahora), y `rewrites` a la zona de seguridad configurables por variable de entorno (`ZONA_SEGURIDAD_URL`).
- Extraer a `packages/marca` la identidad de 2.8: tokens CSS (claro y oscuro), las fuentes Archivo y Martian Mono, la rampa del mapa, el encabezado y el pie. Los enlaces entre zonas van con `<a>`.
- Actualizar el `.gitignore` (rutas nuevas de `public/vendor` y `public/data`), el CI con matriz por app (lint, tipos, build) y la configuración local de `.claude/launch.json` con las dos apps.
- **Aceptación:**
  - con ambas apps en local (portal en 3000, seguridad en 3100), `localhost:3000/seguridad` muestra el observatorio completo a través del portal, con mapa y gráfico funcionando;
  - lint, tipos, pruebas de Python y builds en verde;
  - Lighthouse de accesibilidad ≥ 95 en ambas;
  - el portal y el observatorio se ven con la misma identidad (mismos tokens y fuentes, un solo origen en `packages/marca`).

### P2 — Analítica
- Implementar `track()` en `packages/comunidad` (lotes, `sendBeacon`, no-op si no hay URL configurada, respeta `navigator.doNotTrack`).
- Instrumentar los eventos de 2.5 en el observatorio.
- Integrar el beacon de Cloudflare Web Analytics (o Vercel, según P0) con el *site tag* que entregue el autor.
- La parte de Supabase (`POST /eventos`) se completa en P3; aquí basta con un modo de simulación que escriba en la consola en desarrollo.
- **Aceptación:**
  - en desarrollo, cada interacción produce el evento esperado (prueba automática con un mock de `fetch`);
  - no se envía ningún dato personal;
  - la carga inicial no empeora (Lighthouse de rendimiento sin caída de más de 3 puntos).

### P3 — Comunidad: comentarios, feedback y eventos en Supabase
- Escribir la migración `supabase/migrations/<fecha>_dcc_comunidad.sql` (2.3) y la Edge Function `supabase/functions/dcc-comunidad` (2.4) con pruebas locales (Deno).
- Pedir confirmación y aplicar la migración con el MCP. Pedir confirmación otra vez y desplegar la función con `verify_jwt = false`.
- Pedir al autor que cree las claves de Turnstile (sitio público y secreto) y que cargue los secretos de la función en el panel de Supabase.
- Componentes `<Comentarios hilo>`, `<FormularioFeedback app>`.
- **Aceptación:**
  - `list_tables` antes y después muestra que solo aparecieron objetos `dcc_`;
  - un comentario enviado queda `pendiente`, no aparece, se aprueba en el Table Editor y aparece;
  - el feedback no se puede leer desde fuera;
  - un envío sin Turnstile o con el campo trampa lleno se rechaza;
  - el sexto envío del día desde el mismo origen se rechaza;
  - `get_advisors` (seguridad) no reporta avisos nuevos frente a la línea base de 15 avisos de la sección 1, y el de rendimiento ningún WARN nuevo frente a la línea base de 21 (los índices nuevos pueden figurar como `unused_index`, nivel INFO, hasta que tengan uso). No se modifica nada de ROMI aunque reporte otros;
  - con la función apagada o el proyecto pausado, la app sigue funcionando: el bloque de comentarios muestra «no disponible por ahora», `track()` no hace nada y no aparecen errores en la consola.

### P4 — Artículos
- MDX en el portal, el índice `indice.json`, y las páginas `/articulos` y `/articulos/<slug>` con comentarios.
- `<ArticulosRelacionados app>` en el observatorio, con conteos y comentarios desplegables.
- Un artículo de ejemplo en estado `borrador` (no se publica) para probar el flujo.
- **Aceptación:**
  - un artículo con `apps: [seguridad]` aparece en el portal y en el observatorio;
  - su hilo de comentarios es el mismo en ambos lugares;
  - un `borrador` no aparece en producción.

### P5 — Despliegue
- Con confirmación en cada paso:
  - push;
  - crear los proyectos de Vercel `dcc-seguridad` y `dcc-portal` (Root Directory de cada app), sus variables de entorno (URLs de zona, URL de la función, *site key* de Turnstile, *site tag* de analítica) y el deploy hook del observatorio, que el autor carga como secret `VERCEL_DEPLOY_HOOK` en GitHub;
  - restringir el CORS de R2 a los dominios reales.
- **Aceptación:**
  - `dcc-portal.vercel.app/seguridad` sirve el observatorio;
  - comentarios, feedback y eventos funcionan de punta a punta en producción;
  - Lighthouse de accesibilidad ≥ 95;
  - la ingesta semanal dispara el redespliegue.
  - Con esto se cierran la Fase 5 de `PLAN_OBSERVATORIO.md` y estas fases.

### Fuera de este plan (apps futuras)
- **Ficha de mi municipio** y **Radar SECOP** (sección 3): cada una con su propio plan y su Fase 0, cuando el autor lo decida.

---

## 5. Costos

Se mantiene en 0 USD:
- Vercel Hobby: dos proyectos.
- Supabase: el proyecto de ROMI existente, con tablas pequeñas.
- Cloudflare Web Analytics y Turnstile: gratis.
- R2: dentro del plan gratuito.

El único costo previsto sigue siendo el dominio.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Afectar a ROMI | Solo objetos `dcc_`; ninguna política para anon; la clave de ROMI no se usa en los frontends; `list_tables` antes y después; confirmación en cada migración |
| Spam en comentarios | Turnstile, campo trampa, límite diario, moderación previa |
| Llenar la base de ROMI | Eventos agregados por día; límites de longitud. P0 midió el uso actual: 13 MB de 500 MB |
| Supabase pausa `romi-app` por inactividad | La app degrada sin romper; se restaura desde el panel hasta 90 días después; la actividad de la plataforma ayuda a evitarlo |
| Superar 500 000 invocaciones al mes | Lotes de eventos, lectura de comentarios bajo demanda, interruptor de apagado; Supabase avisa y da gracia, no cobra |
| Navegación entre zonas más lenta | Las páginas que se visitan juntas viven en la misma zona; entre zonas se navega con `<a>` (navegación completa, aceptable) |
| Alcance que crece | La ficha municipal y SECOP quedan fuera de este plan; cada app nueva tiene su propio plan |

## 7. Estado

- [x] P0 (verificada 2026-11-12; falta la validación del autor de las decisiones 1, 2, 3 y 5) · [x] P1 (local, verificada 2026-11-12) · [x] P2 (local, en simulación; verificada 2026-11-12) · [~] P3 (escrito y probado en local; falta aplicar la migración, desplegar la función y probar de punta a punta) · [ ] P4 · [ ] P5
- Identidad visual (2.8): aplicada en el sitio local, pendiente de validación del autor.
