# Puesta en marcha: comentarios, feedback y eventos (P3)

**Estado:** todo está escrito y probado en local. **Nada se ha aplicado en Supabase** ni desplegado. Cada paso de abajo que sale del equipo necesita la confirmación del autor, una por una.

Proyecto de destino: `romi-app` (ref `emkinfqdwjtzkkyabmyb`, región sa-east-1), compartido con ROMI y Lector. Solo se crean objetos con prefijo `dcc_` y la función `dcc-comunidad`.

## Orden

| # | Quién | Qué | Cómo se comprueba |
|---|---|---|---|
| 1 | Claude, con confirmación | Aplicar la migración `supabase/migrations/20261112000000_dcc_comunidad.sql` | Lista de tablas antes y después: solo aparecen 4 tablas `dcc_` y 3 funciones `dcc_`. Analizador de seguridad y de rendimiento frente a la línea base (abajo) |
| 2 | **Usted** | Crear el widget de Turnstile (abajo) | Obtiene dos claves: una pública y una secreta |
| 3 | **Usted** | Cargar 3 secretos en Supabase (abajo) | La lista de secretos del panel muestra los 3 nombres |
| 4 | Claude, con confirmación | Desplegar la función `dcc-comunidad` con `verify_jwt = false` | Pruebas de humo (abajo) |
| 5 | Usted y Claude | Variables de entorno de cada app | La app en modo real muestra comentarios y envía eventos |
| 6 | Usted | Moderar comentarios en el panel de Supabase | Un comentario aprobado aparece en la app |

## 1. Migración: línea base para no empeorar nada

Antes de aplicar, `romi-app` ya tenía estos avisos de los analizadores de Supabase (consultados el 2026-11-12). La migración no debe sumar ninguno de seguridad ni de rendimiento de nivel WARN.

- **Seguridad, 15:** 4 `function_search_path_mutable`, 5 `anon_security_definer_function_executable`, 5 `authenticated_security_definer_function_executable`, 1 `auth_leaked_password_protection`.
- **Rendimiento, 21:** 5 `unindexed_foreign_keys` (INFO), 5 `auth_rls_initplan` (WARN), 4 `unused_index` (INFO), 6 `multiple_permissive_policies` (WARN), 1 `duplicate_index` (WARN).

La migración está hecha para no disparar ninguno: funciones `SECURITY INVOKER` con `search_path` vacío, una política explícita que niega todo a `anon` y `authenticated` (así no aparece «RLS sin políticas»), y un índice para la única clave foránea.

**Una salvedad honesta:** los dos índices nuevos de `dcc_comentarios` pueden aparecer como `unused_index` (INFO) mientras no se usen. Es esperable en una tabla nueva y se resuelve solo cuando haya lecturas. No cuenta como empeoramiento.

**Reversa:** `supabase/reversa/dcc_comunidad_bajar.sql` borra solo los objetos `dcc_` y sus datos. Está probado que deja la base exactamente como estaba.

## 2. Widget de Turnstile (Cloudflare)

1. En el panel de Cloudflare, **Turnstile → Add widget**.
2. Nombre: `datos-con-criterio`. Modo: **Managed**.
3. Hostnames (los sitios que pueden mostrar el widget): `dcc-portal.vercel.app`, `luiseromero.com` cuando exista, y `localhost` si quiere probar el modo real en su equipo.
4. Copie la **Site key** (pública, va en las apps) y la **Secret key** (privada, va solo en Supabase). **No pegue la clave secreta en el chat ni en ningún archivo del repositorio.**

## 3. Secretos de la función (Supabase → Edge Functions → Secrets)

| Nombre | Valor |
|---|---|
| `TURNSTILE_SECRET` | La clave secreta del paso anterior |
| `DCC_SAL_HASH` | Un texto aleatorio largo (mínimo 32 caracteres). Para generarlo en PowerShell: `$b = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)` |
| `DCC_ORIGENES` | Los sitios permitidos, separados por comas, sin espacios: `https://dcc-portal.vercel.app,https://luiseromero.com,http://localhost:3000`. Admite `*` dentro de un segmento, para las vistas previas: `https://dcc-portal-*.vercel.app` |

Los secretos de funciones pertenecen al proyecto entero. Hoy `romi-app` no tiene ninguna otra función, así que no hay otra que pueda leerlos.

Si falta cualquiera de los tres, la función **se niega a escribir** (responde `configuracion_incompleta` o rechaza el envío) en lugar de funcionar a medias.

## 4. Pruebas de humo tras desplegar

Sustituya `<URL>` por `https://emkinfqdwjtzkkyabmyb.supabase.co/functions/v1/dcc-comunidad`.

| Prueba | Resultado esperado |
|---|---|
| `GET <URL>/salud` | 200 `{"ok":true}` |
| `OPTIONS <URL>/comentarios` con `Origin` permitido | 204 con `Access-Control-Allow-Origin` |
| Lo mismo con un `Origin` ajeno | 403 `origen_no_permitido` |
| `POST <URL>/eventos` con origen permitido y un lote válido | 204, y una fila nueva en `dcc_eventos_dia` |
| `POST <URL>/comentarios` con un token de Turnstile falso | 403 `verificacion_fallida`, y nada nuevo en `dcc_comentarios` |
| Desde la app publicada: enviar un comentario real | Queda `pendiente` en `dcc_comentarios`, no aparece en la app |
| Lo mismo tras aprobarlo | Aparece en la app |
| Un sexto envío del día desde el mismo origen | 429 `limite_diario` |

## 5. Variables de entorno de las apps

Públicas (van en el navegador; no son secretos):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_COMUNIDAD_URL` | `https://emkinfqdwjtzkkyabmyb.supabase.co/functions/v1/dcc-comunidad` |
| `NEXT_PUBLIC_EVENTOS_URL` | La misma URL terminada en `/eventos` |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | La Site key |
| `NEXT_PUBLIC_CF_BEACON_TOKEN` | El identificador de Cloudflare Web Analytics |

En desarrollo (`npm run dev`) las apps siempre trabajan en **simulación**, aunque estas variables existan. Para probar el modo real en su equipo hay que compilar y servir (`npm run build` y `npm start`), con las variables en un archivo `.env.production.local` de la app (ignorado por git).

Interruptores de apagado, sin tocar código: `NEXT_PUBLIC_EVENTOS=off` y `NEXT_PUBLIC_COMUNIDAD=off`. Si el servicio está apagado, sin configurar o el proyecto de Supabase está pausado, las apps siguen funcionando: el bloque de comentarios dice que no está disponible y los eventos no hacen nada.

## 6. Moderación

En Supabase → **Table Editor → `dcc_comentarios`**:

- **Aprobar:** cambie `estado` de `pendiente` a `aprobado`. **Rechazar:** `rechazado`.
- **Responder como autor:** inserte una fila con `hilo` (el mismo del comentario), `nombre` = `Luis E. Romero`, `cuerpo`, `app_origen`, `estado` = `aprobado` y `respuesta_a` = el `id` del comentario que responde. La app la muestra anidada.
- **Ver el feedback:** tabla `dcc_feedback` (solo usted; nadie más puede leerla).
- **Ver el uso:** tabla `dcc_eventos_dia`, por ejemplo `select evento, propiedad, sum(conteo) from dcc_eventos_dia where fecha >= current_date - 7 group by 1, 2 order by 3 desc;`.
