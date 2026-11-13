// Sirve data/finanzas/gold/ en http://localhost:3300 con CORS y peticiones de rango (lo que DuckDB-WASM espera de R2).
// Uso: npm run datos -w apps/finanzas   y, en apps/finanzas/.env.local:  NEXT_PUBLIC_DATA_URL=http://localhost:3300
// Además de los archivos del gold sirve `alerta_metricas.json`, que en producción publica el flujo desde models/finanzas/artifacts/metrics.json.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "../../..");
const carpeta = join(raiz, "data/finanzas/gold");
const extra = { "alerta_metricas.json": join(raiz, "models/finanzas/artifacts/metrics.json") };
const PUERTO = Number(process.env.PUERTO ?? 3300);
const TIPOS = { ".parquet": "application/vnd.apache.parquet", ".json": "application/json" };

createServer((req, res) => {
  const cabeceras = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, ETag, Accept-Ranges",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  if (req.method === "OPTIONS") return res.writeHead(204, cabeceras).end();
  const nombre = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^([/\\])+/, "");
  const ruta = extra[nombre] ?? join(carpeta, nombre);
  if (nombre.includes("..") || !existsSync(ruta) || !statSync(ruta).isFile()) return res.writeHead(404, cabeceras).end("no existe");
  const { size } = statSync(ruta);
  const tipo = TIPOS[nombre.slice(nombre.lastIndexOf("."))] ?? "application/octet-stream";
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (r) {
    const ini = r[1] === "" ? size - Number(r[2]) : Number(r[1]);
    const fin = r[1] === "" || r[2] === "" ? size - 1 : Math.min(Number(r[2]), size - 1);
    if (ini > fin || ini >= size) return res.writeHead(416, { ...cabeceras, "Content-Range": `bytes */${size}` }).end();
    res.writeHead(206, { ...cabeceras, "Content-Type": tipo, "Content-Range": `bytes ${ini}-${fin}/${size}`, "Content-Length": fin - ini + 1 });
    return req.method === "HEAD" ? res.end() : createReadStream(ruta, { start: ini, end: fin }).pipe(res);
  }
  res.writeHead(200, { ...cabeceras, "Content-Type": tipo, "Content-Length": size });
  return req.method === "HEAD" ? res.end() : createReadStream(ruta).pipe(res);
}).listen(PUERTO, () => console.log(`gold local en http://localhost:${PUERTO}  (${carpeta})`));
