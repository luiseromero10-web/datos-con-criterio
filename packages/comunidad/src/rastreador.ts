/**
 * Cola de eventos de uso. Lógica pura, sin navegador: el transporte y las condiciones se inyectan, y por eso se prueba sola.
 *
 * Privacidad por diseño:
 *  - solo viajan nombres de evento y una propiedad corta de lista cerrada (ids o códigos); nunca texto libre;
 *  - se agrupan repetidos (evento + propiedad + n): no hay un registro por clic ni forma de reconstruir lo que hizo una persona;
 *  - el payload no tiene identificador de visitante, ni dirección IP, ni marca de tiempo de cada evento.
 *
 * Presupuesto (cuota gratuita de Supabase: 500 000 invocaciones al mes, de toda la organización):
 *  - máximo 3 lotes por carga de página;
 *  - un lote cada 10 s como mucho, y hasta 50 pares evento+propiedad por lote.
 */

export type EventoAgregado = { evento: string; propiedad: string; n: number };
export type Carga = { app: string; eventos: EventoAgregado[] };
export type MotivoDescarte = "inactivo" | "nombre_invalido" | "limite_de_lotes";

export type OpcionesRastreador = {
  app: string;
  /** false si el rastreo está apagado o el visitante pidió «no rastrear». */
  activo: () => boolean;
  /** Transporte de un lote ya armado (sendBeacon, fetch o simulación). */
  enviar: (carga: Carga, lote: number) => void;
  alRegistrar?: (evento: string, propiedad: string) => void;
  alDescartar?: (motivo: MotivoDescarte, evento: string, propiedad: string) => void;
  maxLotes?: number;
  maxPares?: number;
  intervaloMs?: number;
};

export const MAX_LOTES = 3;
export const MAX_PARES = 50;
export const INTERVALO_MS = 10_000;

/** Nombre de evento: minúsculas, dígitos y guion bajo. */
export const NOMBRE_EVENTO = /^[a-z][a-z0-9_]{0,39}$/;
/** Propiedad: un id o código corto (p. ej. «hurto_vehiculos», «05», «ult12»). Sin espacios ni signos: no cabe texto libre. */
export const PROPIEDAD_EVENTO = /^[A-Za-z0-9_-]{0,40}$/;

export function crearRastreador(op: OpcionesRastreador) {
  const maxLotes = op.maxLotes ?? MAX_LOTES;
  const maxPares = op.maxPares ?? MAX_PARES;
  const intervalo = op.intervaloMs ?? INTERVALO_MS;
  const cola = new Map<string, EventoAgregado>();
  const vistos = new Set<string>();
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let lotes = 0;

  function vaciar(): void {
    if (temporizador !== null) {
      clearTimeout(temporizador);
      temporizador = null;
    }
    if (cola.size === 0) return;
    const eventos = [...cola.values()];
    cola.clear();
    if (lotes >= maxLotes) {
      for (const e of eventos) op.alDescartar?.("limite_de_lotes", e.evento, e.propiedad);
      return;
    }
    lotes += 1;
    op.enviar({ app: op.app, eventos }, lotes);
  }

  function track(evento: string, propiedad = ""): void {
    if (!op.activo()) {
      op.alDescartar?.("inactivo", evento, propiedad);
      return;
    }
    if (!NOMBRE_EVENTO.test(evento) || !PROPIEDAD_EVENTO.test(propiedad)) {
      op.alDescartar?.("nombre_invalido", evento, propiedad);
      return;
    }
    if (lotes >= maxLotes) {
      op.alDescartar?.("limite_de_lotes", evento, propiedad);
      return;
    }
    const clave = `${evento}|${propiedad}`;
    const actual = cola.get(clave);
    if (actual) actual.n += 1;
    else cola.set(clave, { evento, propiedad, n: 1 });
    op.alRegistrar?.(evento, propiedad);
    if (cola.size >= maxPares) {
      vaciar();
      return;
    }
    if (temporizador === null) temporizador = setTimeout(vaciar, intervalo);
  }

  /** Para eventos que deben contarse una sola vez por carga de página (p. ej. la vista de la app). */
  function trackUnaVez(evento: string, propiedad = ""): void {
    const clave = `${evento}|${propiedad}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    track(evento, propiedad);
  }

  return { track, trackUnaVez, vaciar, estado: () => ({ lotes, maxLotes, pendientes: cola.size }) };
}

/** ¿Debe inyectarse el beacon de visitas? Solo en producción, con identificador y sin «no rastrear». */
export function debeInyectarVisitas(c: { token: string; produccion: boolean; noRastrear: boolean }): boolean {
  return c.produccion && c.token.length > 0 && !c.noRastrear;
}

/** «No rastrear» (DNT) o Control Global de Privacidad activos. */
export function pidioNoRastrear(n: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined, w?: { doNotTrack?: string | null }): boolean {
  return n?.doNotTrack === "1" || w?.doNotTrack === "1" || n?.globalPrivacyControl === true;
}
