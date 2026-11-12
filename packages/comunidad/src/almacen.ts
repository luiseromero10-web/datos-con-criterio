/** Registro en memoria de lo que hace el rastreador, para el panel de simulación (solo desarrollo). No se guarda ni se envía. */
export type Registro = { id: number; t: number; tipo: "evento" | "lote" | "descartado"; texto: string };
export type Instantanea = {
  registros: readonly Registro[];
  lotes: number;
  maxLotes: number;
  pendientes: number;
  noRastrear: boolean;
};

const INICIAL: Instantanea = { registros: [], lotes: 0, maxLotes: 3, pendientes: 0, noRastrear: false };
const LIMITE = 80;

let actual: Instantanea = INICIAL;
let contador = 0;
const oyentes = new Set<() => void>();

export const obtener = (): Instantanea => actual;
export const obtenerServidor = (): Instantanea => INICIAL;

export function suscribir(cb: () => void): () => void {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}

export function publicar(parcial: Partial<Omit<Instantanea, "registros">>, registro?: { tipo: Registro["tipo"]; texto: string }): void {
  const registros = registro ? [...actual.registros, { id: ++contador, t: Date.now(), ...registro }].slice(-LIMITE) : actual.registros;
  actual = { ...actual, ...parcial, registros };
  oyentes.forEach((f) => f());
}
