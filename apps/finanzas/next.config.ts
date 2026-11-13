import path from "node:path";
import type { NextConfig } from "next";

// Esta app es una "zona": se sirve bajo /finanzas y el portal le reenvía ese camino (ver apps/portal/next.config.ts, Fase 6).
// Con basePath, los recursos de Next quedan en /finanzas/_next/... y no chocan con los de otras zonas.
const BASE = "/finanzas";

const nextConfig: NextConfig = {
  basePath: BASE,
  // Las llamadas fetch() no reciben el prefijo solas: el código las arma con lib/ruta.ts.
  env: { NEXT_PUBLIC_BASE_PATH: BASE, NEXT_PUBLIC_APP_ID: "finanzas" },
  transpilePackages: ["@dcc/marca", "@dcc/comunidad"],
  // Solo desarrollo: permite abrir el servidor desde otro equipo de la red local (p. ej. el celular). No afecta a producción.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // monorepo: los paquetes comunes están fuera de esta carpeta
    root: path.join(__dirname, "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
