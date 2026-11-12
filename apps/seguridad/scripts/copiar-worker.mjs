// MapLibre 6 carga su worker como módulo ES; Turbopack no lo resuelve. Se sirve como estático desde public/vendor/maplibre,
// copiado de node_modules en cada arranque para que coincida siempre con la versión instalada.
// En un monorepo con espacios de trabajo, npm sube las dependencias a la raíz: se busca hacia arriba desde esta carpeta.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

function buscarDist() {
  let dir = process.cwd();
  for (;;) {
    const candidato = path.join(dir, "node_modules", "maplibre-gl", "dist");
    if (existsSync(candidato)) return candidato;
    const padre = path.dirname(dir);
    if (padre === dir) throw new Error("No se encontró maplibre-gl en ningún node_modules; ejecute npm install en la raíz del repositorio.");
    dir = padre;
  }
}

const origen = buscarDist();
const destino = "public/vendor/maplibre";
mkdirSync(destino, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) cpSync(path.join(origen, f), path.join(destino, f));
console.log("worker de MapLibre copiado de", origen, "a", destino);
