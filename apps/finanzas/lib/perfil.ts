import { valorIndicador } from "./format";
import type { AnioEmpresa, Catalogos } from "./tipos";

/** Indicadores de la araña: los de sentido definido (más es mejor o menos es mejor), en percentil de desempeño frente a los pares. */
export const EJES_ARANA = [
  "margen_operacional", "margen_neto", "roa", "razon_corriente", "endeudamiento", "cobertura_intereses", "dias_cartera", "crecimiento_real_ingresos",
] as const;

export type Eje = { id: string; nombre: string; valor: number; real: string };

const CORTO: Record<string, string> = {
  margen_operacional: "Margen operacional", margen_neto: "Margen neto", roa: "ROA", razon_corriente: "Razón corriente", endeudamiento: "Endeudamiento",
  cobertura_intereses: "Cobertura de intereses", dias_cartera: "Días de cartera", crecimiento_real_ingresos: "Crecimiento real",
};
export const nombreCorto = (id: string, respaldo = id) => CORTO[id] ?? respaldo;

/** Los ejes que se pueden dibujar: los que tienen percentil (hay pares suficientes y la sociedad tiene el indicador). */
export function ejesDe(a: AnioEmpresa | undefined, cat: Catalogos): Eje[] {
  if (!a) return [];
  const def = new Map(cat.indicadores.map((d) => [d.id, d]));
  const ejes: Eje[] = [];
  for (const id of EJES_ARANA) {
    const p = a.pct[id];
    const d = def.get(id);
    if (p === null || p === undefined || !d) continue;
    ejes.push({ id, nombre: nombreCorto(id, d.nombre), valor: p, real: valorIndicador(d.unidad, a.ind[id]) });
  }
  return ejes;
}

/** Ejes comunes a dos sociedades (para superponer sus arañas con los mismos radios). */
export function ejesComunes(a: Eje[], b: Eje[]): string[] {
  const ids = new Set(b.map((e) => e.id));
  return a.filter((e) => ids.has(e.id)).map((e) => e.id);
}
