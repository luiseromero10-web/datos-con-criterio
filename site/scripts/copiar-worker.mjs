// MapLibre 6 carga su worker como módulo ES; Turbopack no lo resuelve. Se sirve como estático desde public/vendor/maplibre,
// copiado de node_modules en cada arranque para que coincida siempre con la versión instalada.
import { cpSync, mkdirSync } from "node:fs";

const origen = "node_modules/maplibre-gl/dist";
const destino = "public/vendor/maplibre";
mkdirSync(destino, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) cpSync(`${origen}/${f}`, `${destino}/${f}`);
console.log("worker de MapLibre copiado a", destino);
