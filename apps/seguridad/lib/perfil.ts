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
    ejes.push({ id: d.id, nombre: d.nombre, valor: percentil(t, con.map(tasaDe)), real: `${ent(c[cod] ?? 0)} ${(c[cod] ?? 0) === 1 ? "denuncia" : "denuncias"} ·${dec(t)} por 100 mil` });
  }
  return ejes;
}

/** Datos que no caben en la araña pero acompañan al municipio, para el delito que se está viendo. */
export function datosClave(cod: string, cambios: Cambio[]): { etiqueta: string; valor: string }[] {
  const c = cambios.find((x) => x.cod_mpio === cod);
  if (!c) return [];
  const pct = ((c.ult - c.prev) / Math.max(c.prev, 1)) * 100;
  return [
    { etiqueta: "Últimos 12 meses", valor: `${ent(c.ult)} (antes ${ent(c.prev)})` },
    { etiqueta: "Variación", valor: `${pct >= 0 ? "+" : "−"}${dec(Math.abs(pct))} %` },
    { etiqueta: "Agrupación (Gi*)", valor: `z = ${dec(c.z)}` },
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
