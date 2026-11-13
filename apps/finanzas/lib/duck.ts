"use client";
/** DuckDB-WASM cargado de forma diferida: lee los Parquet del gold directamente desde R2 (lectura por rangos). */
import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

export const DATA_URL = (process.env.NEXT_PUBLIC_DATA_URL ?? "https://pub-9d9d9ff84f4e49209f1c0cdfdaaaf366.r2.dev/finanzas/gold").replace(/\/+$/, "");
export const ARCHIVOS = ["empresas", "empresas_anio", "estados", "indicadores", "pares", "senales", "sector_anio", "sector_resumen", "alerta_agregada", "ciiu"] as const;

let dbPromise: Promise<AsyncDuckDB> | null = null;

export function getDb(): Promise<AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const duckdb = await import("@duckdb/duckdb-wasm");
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker!}");`], { type: "text/javascript" }));
      const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), new Worker(workerUrl));
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);
      for (const f of ARCHIVOS) {
        await db.registerFileURL(`${f}.parquet`, `${DATA_URL}/${f}.parquet`, duckdb.DuckDBDataProtocol.HTTP, false);
      }
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null; // permite reintentar si falla la red
    });
  }
  return dbPromise;
}

export async function consultar<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const res = await conn.query(sql);
    return res.toArray().map((r) => r.toJSON() as T);
  } finally {
    await conn.close();
  }
}
