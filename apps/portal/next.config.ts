import path from "node:path";
import type { NextConfig } from "next";

// El portal es la zona por defecto: sirve la portada, los artículos, «Sobre mí» y la privacidad, y reenvía cada app a su propio
// proyecto de Vercel. Cada app nueva es una zona más: un proyecto aparte y un par de líneas aquí.
// Por variable de entorno cambia el destino sin tocar el código (en producción, la URL del proyecto de cada app).
const ZONA_SEGURIDAD = process.env.ZONA_SEGURIDAD_URL ?? "http://localhost:3100";

const nextConfig: NextConfig = {
  transpilePackages: ["@dcc/marca"],
  // Solo desarrollo: permite abrir el servidor desde otro equipo de la red local (p. ej. el celular). No afecta a producción.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      { source: "/seguridad", destination: `${ZONA_SEGURIDAD}/seguridad` },
      // incluye /seguridad/_next/... (recursos de la zona) gracias a su basePath
      { source: "/seguridad/:path*", destination: `${ZONA_SEGURIDAD}/seguridad/:path*` },
    ];
  },
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
