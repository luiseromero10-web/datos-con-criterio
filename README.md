# Datos con Criterio — Observatorio de Seguridad

Caso 1 del portafolio de Luis E. Romero: observatorio de delitos en Colombia con datos abiertos
(Policía Nacional / MinDefensa vía datos.gov.co, DANE). Plan completo en [PLAN_OBSERVATORIO.md](PLAN_OBSERVATORIO.md).

Estado: Fase 0 (preparación y verificación de fuentes). Ver [docs/fuentes.md](docs/fuentes.md).
Los datos descargados van en `data/` (ignorado). Credenciales solo en variables de entorno (`.env.example`).

## Estructura y cómo correrlo

```
apps/portal       zona por defecto: portada, artículos, «Sobre mí», privacidad (puerto 3000)
apps/seguridad    Observatorio de seguridad, servido bajo /seguridad (puerto 3100)
packages/marca    identidad común: tokens, tipografía, cabecera, pie y rampa del mapa
pipelines/ models/ tests/ docs/   datos, modelos y documentación (Python, ver PLAN_OBSERVATORIO.md)
```

Cada app es un proyecto de Vercel independiente; el portal reenvía `/seguridad` a la zona correspondiente. Plan completo en [PLAN_PLATAFORMA.md](PLAN_PLATAFORMA.md).

```bash
npm install                 # una sola vez, en la raíz
npm run dev:seguridad       # terminal 1: la zona en http://localhost:3100/seguridad
npm run dev:portal          # terminal 2: el portal en http://localhost:3000 (ahí también se ve /seguridad)
npm run lint && npm run build && npm run tipos
```
