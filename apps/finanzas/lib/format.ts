/** Formato colombiano de cifras: separador de miles con punto, decimales con coma; escalas en palabras (millones, mil millones, billones). */
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const nf3 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3, minimumFractionDigits: 3 });

export const entero = (n: number) => nf0.format(n);
export const decimal = (n: number) => nf1.format(n);
export const dos = (n: number) => nf2.format(n);
export const tres = (n: number) => nf3.format(n);
export const signo = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + decimal(Math.abs(n)) + " %";
/** Fracción (0,123) como porcentaje («12,3 %»). Los valores gigantes (errores de la fuente) se muestran en notación compacta. */
export const porcentaje = (f: number) => (Math.abs(f) >= 1e5 ? `${(f * 100).toExponential(1).replace(".", ",")} %` : `${decimal(f * 100)} %`.replace("-", "−"));

/** Pesos con la escala más cercana: «$ 1,3 billones», «$ 345 mil millones», «$ 12,3 millones», «$ 4.500». */
export function pesos(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1e12) return `${s}$ ${decimal(a / 1e12)} ${a / 1e12 >= 2 ? "billones" : "billón"}`;
  if (a >= 1e9) return `${s}$ ${a / 1e9 >= 100 ? entero(a / 1e9) : decimal(a / 1e9)} mil millones`;
  if (a >= 1e6) return `${s}$ ${a / 1e6 >= 100 ? entero(a / 1e6) : decimal(a / 1e6)} millones`;
  return `${s}$ ${entero(a)}`;
}

export type Unidad = "fraccion" | "veces" | "dias";

/** Un indicador con su unidad: porcentaje, «veces» o días. */
export function valorIndicador(unidad: Unidad, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  if (unidad === "fraccion") return porcentaje(v);
  if (unidad === "dias") return Math.abs(v) >= 1e5 ? `${(v / 1e3).toExponential(1).replace(".", ",")} mil días` : `${entero(v)} días`;
  return Math.abs(v) >= 1e5 ? `${v.toExponential(1).replace(".", ",")}` : `${dos(v)}`.replace("-", "−");
}

export const nit = (n: number | string) => entero(Number(n));

export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Razón social con mayúsculas legibles: «INVERSIONES UNO S.A.S.» -> «Inversiones Uno S.A.S.» (las siglas se respetan). */
export function nombrePropio(s: string): string {
  if (!s) return s;
  const hayMinuscula = /[a-záéíóúñ]/.test(s);
  if (hayMinuscula) return s; // ya viene bien escrito
  return s
    .toLowerCase()
    .replace(/(^|[\s(\-/&.])([a-záéíóúñ])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(S\.?A\.?S?\.?|S\.?C\.?A\.?|S\.?A\.?|Ltda\.?|E\.?S\.?P\.?|Cia\.?|Y|De|Del|La|Las|El|Los|Y\/O|En|Para|Por)\b/gi, (m: string) => {
      const baja = ["y", "de", "del", "la", "las", "el", "los", "en", "para", "por", "y/o"];
      return baja.includes(m.toLowerCase()) ? m.toLowerCase() : m.toUpperCase();
    })
    .replace(/^./, (c) => c.toUpperCase());
}
