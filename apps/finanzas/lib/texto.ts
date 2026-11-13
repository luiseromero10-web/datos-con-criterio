import { valorIndicador } from "./format";
import type { AnioEmpresa, DefIndicador } from "./tipos";

type Lado = { nombre: string; a: AnioEmpresa };

const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Lectura en palabras de dos sociedades en un mismo año: en qué indicadores una está mejor y en cuáles ocurre lo contrario.
 * «Mejor» sigue el sentido del indicador (menos endeudamiento es mejor). Los de sentido neutro no se comparan.
 * Los percentiles de cada una son frente a SUS pares: si son de sectores distintos, los valores reales son lo comparable.
 */
export function fraseComparacion(x: Lado, y: Lado, defs: DefIndicador[], max = 4): string[] {
  const filas = defs
    .filter((d) => d.sentido !== 0)
    .map((d) => {
      const vx = x.a.ind[d.id];
      const vy = y.a.ind[d.id];
      if (vx === null || vx === undefined || vy === null || vy === undefined || vx === vy) return null;
      const xMejor = d.sentido > 0 ? vx > vy : vx < vy;
      const px = x.a.pct[d.id];
      const py = y.a.pct[d.id];
      const brecha = px !== null && px !== undefined && py !== null && py !== undefined ? Math.abs(px - py) : 0;
      return { d, vx, vy, xMejor, brecha };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  if (filas.length === 0) return ["No hay indicadores comparables con dato en las dos sociedades este año."];
  const mejoresX = filas.filter((f) => f.xMejor).length;
  const resumen = `${x.nombre} está mejor en ${mejoresX} de ${filas.length} indicadores comparables y ${y.nombre} en ${filas.length - mejoresX}.`;
  const destacados = [...filas].sort((p, q) => q.brecha - p.brecha).slice(0, max);
  const frases = destacados.map((f) => {
    const ganador = f.xMejor ? x : y;
    const vg = f.xMejor ? f.vx : f.vy;
    const vp = f.xMejor ? f.vy : f.vx;
    return `${ganador.nombre} tiene ${f.d.sentido > 0 ? "mayor" : "menor"} ${minuscula(f.d.nombre)} (${valorIndicador(f.d.unidad, vg)} frente a ${valorIndicador(f.d.unidad, vp)}).`;
  });
  return [resumen, ...frases];
}

/** «Mejor que el 72 % de sus pares» / «Por debajo de…». En indicadores de sentido neutro solo se dice la posición. */
export function lecturaPercentil(pct: number | null | undefined, sentido: -1 | 0 | 1): string {
  if (pct === null || pct === undefined) return "Sin pares suficientes";
  if (sentido === 0) return `Por encima del ${Math.round(pct)} % de sus pares`;
  return pct >= 50 ? `Mejor que el ${Math.round(pct)} % de sus pares` : `Peor que el ${Math.round(100 - pct)} % de sus pares`;
}
