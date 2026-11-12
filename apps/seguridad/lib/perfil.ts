// Perfil de un municipio para la araña (radar): un eje por tipo de delito. Módulo puro: sin React ni mapa, para probarlo fácil.
// Cada eje es el percentil de la tasa por 100 mil del municipio en ese delito frente a los demás municipios:
// «¿qué porcentaje de municipios tiene una tasa estrictamente menor?». 100 = el más alto del país; 0 = ninguno por debajo (p. ej., sin denuncias).

import type { Cambio, Muni } from "./datos";
import { DELITOS, type DelitoId } from "./delitos";

export type EjePerfil = {
  id: DelitoId;
  nombre: string;
  /** percentil 0–100 */
  valor: number;
  /** tasa por 100 mil y denuncias (números), para comparar dos municipios */
  tasa: number;
  hechos: number;
  /** el valor real, ya en texto, para el tooltip y la lista accesible */
  real: string;
};

export type ConteosPorDelito = Partial<Record<DelitoId, Record<string, number>>>;

/** Porcentaje (0–100) de valores estrictamente menores que `x`. */
export function percentil(x: number, todos: number[]): number {
  if (todos.length === 0 || !Number.isFinite(x)) return 0;
  let menores = 0;
  for (const v of todos) if (v < x) menores++;
  return Math.round((menores / todos.length) * 100);
}

/** Cambio relativo frente a los 12 meses previos; acotado para que un municipio que pasa de 1 a 40 no aplaste la escala. */
export function cambioRelativo(ult: number, prev: number): number {
  const r = (ult - prev) / Math.max(prev, 5);
  return Math.max(-1, Math.min(3, r));
}

const dec = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });
const ent = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

/** Un eje por delito; los delitos cuyos conteos aún no se han cargado se omiten. Devuelve null si el municipio no existe o no tiene población. */
export function perfilPorDelito(cod: string, munis: Muni[], conteos: ConteosPorDelito): EjePerfil[] | null {
  const mu = munis.find((m) => m.cod_mpio === cod);
  if (!mu || !(mu.pob > 0)) return null;
  const con = munis.filter((m) => m.pob > 0);
  const ejes: EjePerfil[] = [];
  for (const d of DELITOS) {
    const c = conteos[d.id];
    if (!c) continue;
    const tasaDe = (m: Muni) => ((c[m.cod_mpio] ?? 0) / m.pob) * 1e5;
    const t = tasaDe(mu);
    ejes.push({ id: d.id, nombre: d.nombre, tasa: t, hechos: c[cod] ?? 0, valor: percentil(t, con.map(tasaDe)), real: `${ent(c[cod] ?? 0)} ${(c[cod] ?? 0) === 1 ? "denuncia" : "denuncias"} · ${dec(t)} por 100 mil` });
  }
  return ejes;
}

/** Datos que no caben en la araña pero acompañan al municipio, para el delito que se está viendo. */
export function datosClave(cod: string, cambios: Cambio[], conAgrupacion = true): { etiqueta: string; valor: string }[] {
  const c = cambios.find((x) => x.cod_mpio === cod);
  if (!c) return [];
  const pct = ((c.ult - c.prev) / Math.max(c.prev, 1)) * 100;
  return [
    { etiqueta: "Últimos 12 meses", valor: `${ent(c.ult)} (antes ${ent(c.prev)})` },
    { etiqueta: "Variación", valor: `${pct >= 0 ? "+" : "−"}${dec(Math.abs(pct))} %` },
    ...(conAgrupacion ? [{ etiqueta: "Agrupación (Gi*)", valor: `z = ${dec(c.z)}` }] : []),
  ];
}

/**
 * Altura de la extrusión 3D en metros. Es proporcional al tamaño del municipio (su lado mayor, `tamanoM`) para que un municipio pequeño no se vea
 * como una torre ni uno grande como una losa; dentro de esa proporción, crece con el percentil de la tasa.
 */
export function alturaExtrusion(percentilTasa: number, tamanoM: number): number {
  const p = Math.max(0, Math.min(100, percentilTasa));
  const lado = Math.max(2000, tamanoM);
  return lado * (0.12 + (p / 100) * 0.5);
}

/** Lado mayor aproximado, en metros, de una caja [oeste, sur, este, norte] en grados. */
export function ladoMayorM(caja: [number, number, number, number]): number {
  const [o, s, e, n] = caja;
  const lat = ((s + n) / 2) * (Math.PI / 180);
  return Math.max((e - o) * 111320 * Math.cos(lat), (n - s) * 110574);
}

/** Distancia en kilómetros entre dos puntos [longitud, latitud] (fórmula de haversine). */
export function distanciaKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const veces = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString("es-CO");

/**
 * Lectura en palabras de dos perfiles: quién tiene la tasa total más alta, cuántas veces, y en qué tipo de delito ocurre lo contrario (si ocurre).
 * La tasa total es la suma de las tasas por tipo de delito. No interpreta causas: solo describe diferencias.
 */
export function fraseComparacion(nombreA: string, nombreB: string, a: EjePerfil[], b: EjePerfil[]): string[] {
  const totA = a.reduce((s, e) => s + e.tasa, 0);
  const totB = b.reduce((s, e) => s + e.tasa, 0);
  const frases: string[] = [];
  if (totA === 0 && totB === 0) return ["Ninguno de los dos municipios registra denuncias en el periodo."];
  if (totA === totB) frases.push(`${nombreA} y ${nombreB} tienen la misma tasa total de denuncias.`);
  const [alto, bajo, tAlto, tBajo, ejesAlto, ejesBajo] = totA >= totB ? [nombreA, nombreB, totA, totB, a, b] : [nombreB, nombreA, totB, totA, b, a];
  if (totA !== totB) {
    frases.push(tBajo === 0 ? `${alto} registra denuncias y ${bajo} no registra ninguna.` : `En conjunto, ${alto} tiene una tasa de denuncias ${veces(tAlto / tBajo)} veces la de ${bajo}.`);
    // la mayor excepción: un delito donde el municipio de tasa total más baja supera al más alto
    let mejor: { nombre: string; razon: number } | null = null;
    ejesBajo.forEach((e, i) => {
      const o = ejesAlto[i];
      if (!o || e.tasa <= 0) return;
      const razon = o.tasa > 0 ? e.tasa / o.tasa : Infinity;
      if (razon > 1 && (!mejor || razon > mejor.razon)) mejor = { nombre: e.nombre, razon };
    });
    const ex = mejor as { nombre: string; razon: number } | null;
    frases.push(ex ? `La excepción es «${ex.nombre}»: ahí ${bajo} supera a ${alto}${Number.isFinite(ex.razon) ? ` (${veces(ex.razon)} veces)` : " (el otro no registra)"}.` : `${alto} está por encima de ${bajo} en todos los tipos de delito.`);
  }
  if (Math.min(a.reduce((s, e) => s + e.hechos, 0), b.reduce((s, e) => s + e.hechos, 0)) < 30) {
    frases.push("Ojo: uno de los dos tiene pocas denuncias en el periodo y su tasa es inestable.");
  }
  return frases;
}
