import path from "node:path";
import type { NextConfig } from "next";

// Esta app es una "zona": se sirve bajo /seguridad y el portal le reenvía ese camino (ver apps/portal/next.config.ts).
// Con basePath, los recursos de Next quedan en /seguridad/_next/... y no chocan con los de otras zonas.
const BASE = "/seguridad";

const nextConfig: NextConfig = {
  basePath: BASE,
  // Los archivos de public/ y las llamadas fetch() no reciben el prefijo solas: el código las arma con lib/ruta.ts.
  env: { NEXT_PUBLIC_BASE_PATH: BASE },
  transpilePackages: ["@dcc/marca"],
  // Solo desarrollo: permite abrir el servidor desde otro equipo de la red local (p. ej. el celular). No afecta a producción.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // monorepo: el paquete común está fuera de esta carpeta
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
