const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const entero = (n: number) => nf0.format(n);
export const decimal = (n: number) => nf1.format(n);
export const signo = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + decimal(Math.abs(n)) + " %";

export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
export const mesAnio = (iso: string) => {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
};
