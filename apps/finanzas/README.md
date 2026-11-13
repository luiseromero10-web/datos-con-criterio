# apps/finanzas

Sitio de la Radiografía Financiera de Empresas (zona `/finanzas`). Next.js 16 + `@dcc/marca` + `@dcc/comunidad`.
El navegador lee los parquet del gold con DuckDB-WASM, por rangos HTTP; no hay servidor de datos.

## En local

```bash
npm run datos:finanzas   # sirve data/finanzas/gold en http://localhost:3300 (CORS y rangos)
npm run dev:finanzas     # http://localhost:3200/finanzas
```

Hace falta tener el gold (`uv run python -m pipelines.finanzas.transformar`, `…analisis`, `models.finanzas.puntuar`) y un `apps/finanzas/.env.local` con `NEXT_PUBLIC_DATA_URL=http://localhost:3300` (ver `.env.example`).
Sin esa variable la app lee el gold público de R2. Para `metadatos.json` (solo lo crea la publicación) hay que generarlo a mano en local; ver `docs/finanzas/decisiones.md` F12.

## Comprobaciones

```bash
npm run tipos -w apps/finanzas
npm run lint -w apps/finanzas
npm test -w apps/finanzas
npm run build -w apps/finanzas
```

Rutas: `/` (buscador), `/empresa/[nit]`, `/comparar?a=&b=`, `/sector`, `/sector/[codigo]`, `/metodologia`.
Decisiones y límites: `docs/finanzas/decisiones.md` (F12) y `PLAN_FINANZAS.md`.
