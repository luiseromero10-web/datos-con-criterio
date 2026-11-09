Vamos a construir el primer caso de mi portafolio de datos "Datos con Criterio": un Observatorio de Seguridad de Colombia con datos abiertos (SIEDCO en datos.gov.co, DANE), pronóstico con ML, puntos calientes, anomalías y un simulador de asignación de recursos, publicado como sitio Next.js en Vercel con DuckDB-WASM.

El plan completo está en `PLAN_OBSERVATORIO.md`, en esta carpeta. Léelo entero antes de hacer nada; es la fuente de verdad del alcance, la arquitectura, la estructura del repo y los criterios de aceptación de cada fase.

Reglas de trabajo:
- Responde y documenta en español.
- Trabaja fase por fase, en orden. Al terminar cada fase: verifica sus criterios de aceptación ejecutando tú mismo las pruebas o comandos, haz un commit local, marca la fase en la sección "Estado" del plan y detente para que yo revise antes de pasar a la siguiente.
- Tengo conectados por MCP con Claude: GitHub, Vercel, Cloudflare y Supabase. Al empezar, comprueba cuáles están disponibles en esta sesión y úsalos para operar esos servicios (crear el repo, el proyecto en Vercel y su deploy hook, el bucket de R2 y su CORS, revisar despliegues y logs) en lugar de pedirme pasos manuales. Si alguno no aparece o falla, dímelo y dame el paso manual.
- Pídeme confirmación antes de cada acción hacia afuera: crear el repo, hacer push, desplegar, crear o cambiar el bucket, cambiar la configuración de un proyecto. Una aprobación vale solo para esa acción.
- Credenciales: no manejes valores de tokens ni claves. Yo creo el token de datos.gov.co y las claves de acceso de R2 y los cargo como secrets de GitHub; tú me dices sus nombres exactos (por ejemplo `SOCRATA_APP_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `VERCEL_DEPLOY_HOOK`) y dónde ponerlos. No crees cuentas.
- Supabase: el plan no usa base de datos, así que no lo uses salvo que una fase lo justifique y yo lo apruebe. Mi proyecto de Supabase es compartido con otras apps mías (ROMI, Lector): nunca toques sus tablas, Auth ni buckets; si llegara a usarse, solo con objetos nuevos con prefijo `dcc_`.
- Nunca pongas tokens ni claves en el código ni en commits; usa variables de entorno y un `.env` en `.gitignore`. Los datos descargados van en `data/`, también ignorado.
- No uses APIs de IA pagas en el producto. No uses datos que no sean públicos.
- Si una fuente del plan no existe, cambió o está desactualizada, no inventes: repórtalo y propone alternativas.
- Registra las decisiones relevantes en `docs/decisiones.md`.
- Si algo del plan resulta mal planteado, dilo y propone el cambio antes de desviarte.

Empieza por la Fase 0: inicializa git y la estructura del repo, configura `uv` con Python 3.12 y verifica en datos.gov.co los conjuntos de SIEDCO vigentes (ID, columnas, rango de fechas, frecuencia de actualización, volumen), además de la población DANE, el MGN y DIVIPOLA. Entrega `docs/fuentes.md` con tu recomendación de alcance (qué delitos y desde qué año) y espera mi confirmación.
