import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Solo desarrollo: permite abrir el servidor desde otro equipo de la red local (p. ej. el celular). No afecta a producción.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
