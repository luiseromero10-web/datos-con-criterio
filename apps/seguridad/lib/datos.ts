"use client";
import { consultar, DATA_URL } from "./duck";
import type { DelitoId } from "./delitos";

export type Meta = {
  fecha_corte: string;
  actualizado: string;
  version_modelo: string | null;
  metodo?: string;
  horizonte_semanas?: number;
  ultima_semana_entrenamiento?: string;
  semanas_provisionales: number;
};
export type Muni = { cod_mpio: string; municipio: string; cod_dpto: string; departamento: string; pob: number };
export type Alcance = { tipo: "nacional" } | { tipo: "dpto"; cod: string } | { tipo: "mpio"; cod: string };
export type Punto = { p: string; n: number };
export type PuntoPron = { p: string; p10: number; p50: number; p90: number; tipo: "provisional" | "futuro" };
export type Anomalia = { p: string; nivel: "dpto" | "mpio"; cod: string; valor: number; esperado: number; z: number; sentido: "alta" | "baja" };
export type Cambio = { cod_mpio: string; ult: number; prev: number; tasa: number; z: number; categoria: string };
export type Periodo = { id: string; etiqueta: string; desde: string; hasta: string };

const DELITO_OK = /^[a-z_]+$/;
const COD_OK = /^\d{2,5}$/;
const seguro = (s: string, re: RegExp) => {
  if (!re.test(s)) throw new Error("parámetro inválido");
  return s;
};

export async function cargarMeta(): Promise<Meta> {
  const r = await fetch(`${DATA_URL}/metadatos.json`, { cache: "no-cache" });
  if (!r.ok) throw new Error("No se pudo leer metadatos.json");
  return r.json();
}

export async function cargarMunicipios(): Promise<Muni[]> {
  const f = await consultar<Muni>(
    `SELECT cod_mpio, municipio, cod_dpto, departamento, poblacion_2026::DOUBLE AS pob FROM 'municipios.parquet' ORDER BY departamento, municipio`,
  );
  return f.map((m) => ({ ...m, pob: Number(m.pob) }));
}

/** Primer día del último mes completo dentro de las semanas confiables (excluye las semanas provisionales). */
export function ultimoMesConfiable(meta: Meta): string {
  const lunes = meta.ultima_semana_entrenamiento ?? meta.fecha_corte;
  const fin = new Date(Date.parse(lunes.slice(0, 10) + "T00:00:00Z") + 6 * 86400000); // domingo de esa semana
  const finDeMes = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 0));
  const ref = fin.getTime() >= finDeMes.getTime() ? fin : new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), 0));
  return `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function sumarMeses(iso: string, n: number): string {
  const d = new Date(Date.parse(iso + "T00:00:00Z"));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function periodosDisponibles(meta: Meta): Periodo[] {
  const ultimo = ultimoMesConfiable(meta);
  const out: Periodo[] = [{ id: "ult12", etiqueta: "Últimos 12 meses completos", desde: sumarMeses(ultimo, -11), hasta: ultimo }];
  const anioUlt = Number(ultimo.slice(0, 4));
  for (let a = anioUlt - 1; a >= 2018; a--) out.push({ id: String(a), etiqueta: String(a), desde: `${a}-01-01`, hasta: `${a}-12-01` });
  out.push({ id: "todo", etiqueta: "Todo el periodo (2018 en adelante)", desde: "2018-01-01", hasta: ultimo });
  return out;
}

export async function conteosPorMunicipio(delito: DelitoId, desde: string, hasta: string): Promise<Record<string, number>> {
  const f = await consultar<{ cod_mpio: string; n: number }>(
    `SELECT cod_mpio, SUM(conteo)::DOUBLE AS n FROM 'hechos_mes_mpio.parquet'
     WHERE delito='${seguro(delito, DELITO_OK)}' AND periodo >= DATE '${desde}' AND periodo <= DATE '${hasta}' GROUP BY 1`,
  );
  return Object.fromEntries(f.map((r) => [r.cod_mpio, Number(r.n)]));
}

export async function totalNacional(delito: DelitoId, desde: string, hasta: string): Promise<number> {
  const f = await consultar<{ n: number }>(
    `SELECT COALESCE(SUM(conteo),0)::DOUBLE AS n FROM 'hechos_mes_mpio.parquet'
     WHERE delito='${seguro(delito, DELITO_OK)}' AND periodo >= DATE '${desde}' AND periodo <= DATE '${hasta}'`,
  );
  return Number(f[0]?.n ?? 0);
}

function filtroAlcance(a: Alcance, tabla: "hechos" | "pred"): { join: string; where: string } {
  if (a.tipo === "nacional") return { join: "", where: tabla === "pred" ? "AND nivel = 'dpto'" : "" };
  if (tabla === "hechos") {
    return a.tipo === "dpto"
      ? { join: "JOIN 'municipios.parquet' m USING (cod_mpio)", where: `AND m.cod_dpto = '${seguro(a.cod, COD_OK)}'` }
      : { join: "", where: `AND cod_mpio = '${seguro(a.cod, COD_OK)}'` };
  }
  return { join: "", where: `AND nivel = '${a.tipo}' AND cod = '${seguro(a.cod, COD_OK)}'` };
}

export async function serieSemanal(delito: DelitoId, a: Alcance): Promise<Punto[]> {
  const { join, where } = filtroAlcance(a, "hechos");
  const f = await consultar<{ p: string; n: number }>(
    `SELECT strftime(periodo, '%Y-%m-%d') AS p, SUM(conteo)::DOUBLE AS n FROM 'hechos_semana_mpio.parquet' ${join}
     WHERE delito='${seguro(delito, DELITO_OK)}' ${where} GROUP BY 1 ORDER BY 1`,
  );
  return f.map((r) => ({ p: r.p, n: Number(r.n) }));
}

export async function pronostico(
  delito: DelitoId,
  a: Alcance,
): Promise<{ puntos: PuntoPron[]; nivelUsado: "nacional" | "dpto" | "mpio" }> {
  const consulta = async (al: Alcance) => {
    const { where } = filtroAlcance(al, "pred");
    const agg = al.tipo === "nacional";
    return consultar<PuntoPron>(
      `SELECT strftime(periodo, '%Y-%m-%d') AS p, ${agg ? "NULL::DOUBLE" : "p10::DOUBLE"} AS p10, SUM(p50)::DOUBLE AS p50,
              ${agg ? "NULL::DOUBLE" : "p90::DOUBLE"} AS p90, MAX(tipo) AS tipo
       FROM 'predicciones.parquet' WHERE delito='${seguro(delito, DELITO_OK)}' ${where}
       GROUP BY periodo ${agg ? "" : ", p10, p90"} ORDER BY periodo`,
    );
  };
  let puntos = await consulta(a);
  let nivelUsado: "nacional" | "dpto" | "mpio" = a.tipo;
  if (puntos.length === 0 && a.tipo === "mpio") {
    puntos = await consulta({ tipo: "dpto", cod: a.cod.slice(0, 2) });
    nivelUsado = "dpto"; // municipio sin pronóstico propio (poco volumen): se muestra el del departamento
  }
  const num = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));
  return { puntos: puntos.map((r) => ({ ...r, p10: num(r.p10), p50: num(r.p50), p90: num(r.p90) })), nivelUsado };
}

export async function anomaliasDe(delito: DelitoId, a: Alcance): Promise<Anomalia[]> {
  if (a.tipo === "nacional") return [];
  return consultar<Anomalia>(
    `SELECT strftime(periodo, '%Y-%m-%d') AS p, nivel, cod, valor::DOUBLE AS valor, esperado::DOUBLE AS esperado, z::DOUBLE AS z, sentido
     FROM 'anomalias.parquet' WHERE delito='${seguro(delito, DELITO_OK)}' AND nivel='${a.tipo}' AND cod='${seguro(a.cod, COD_OK)}' ORDER BY periodo`,
  );
}

export async function anomaliasRecientes(delito: DelitoId, desde: string, limite = 10): Promise<Anomalia[]> {
  return consultar<Anomalia>(
    `SELECT strftime(periodo, '%Y-%m-%d') AS p, nivel, cod, valor::DOUBLE AS valor, esperado::DOUBLE AS esperado, z::DOUBLE AS z, sentido
     FROM 'anomalias.parquet' WHERE delito='${seguro(delito, DELITO_OK)}' AND periodo >= DATE '${desde}' ORDER BY abs(z) DESC LIMIT ${Number(limite)}`,
  );
}

export async function cambiosHotspots(delito: DelitoId): Promise<Cambio[]> {
  const f = await consultar<Cambio>(
    `SELECT cod_mpio, hechos_ult12m::DOUBLE AS ult, hechos_prev12m::DOUBLE AS prev, tasa_ult12m::DOUBLE AS tasa, z_ult::DOUBLE AS z, categoria
     FROM 'hotspots.parquet' WHERE delito='${seguro(delito, DELITO_OK)}'`,
  );
  return f.map((r) => ({ ...r, ult: Number(r.ult), prev: Number(r.prev), tasa: Number(r.tasa), z: Number(r.z) }));
}
