// Validación y utilidades puras de la función dcc-comunidad. Sin dependencias: corre igual en Deno y en Node (pruebas).
// Regla de oro: lo que llega de internet no es de fiar. Todo se valida aquí, y la base vuelve a validar con sus restricciones.

export const APPS = ["portal", "seguridad"] as const;
export const HILO = /^(app|articulo):[a-z0-9-]{1,80}$/;
export const NOMBRE_EVENTO = /^[a-z][a-z0-9_]{0,39}$/;
export const PROPIEDAD_EVENTO = /^[A-Za-z0-9_-]{0,40}$/;
export const TIPOS_FEEDBACK = ["error", "idea", "dato", "otro"] as const;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_BYTES_CUERPO = 8 * 1024;
export const CUPO_DIARIO = 5; // envíos de comentarios (y por separado de feedback) por origen y día
export const MAX_EVENTOS_LOTE = 50;
export const MAX_N_EVENTO = 1000;
export const MAX_ENLACES = 2;

const DELITOS = /^(homicidio|lesiones|hurto_personas|hurto_comercio|hurto_residencias|hurto_vehiculos)$/;
const VACIA = /^$/;

/** Lista blanca: cada evento y, para cada uno, la forma exacta que puede tener su propiedad. */
export const EVENTOS_PERMITIDOS: Record<string, RegExp> = {
  vista_app: VACIA,
  filtro_delito: DELITOS,
  filtro_departamento: /^(pais|\d{2})$/,
  filtro_municipio: VACIA,
  filtro_periodo: /^(ult12|todo|20\d{2})$/,
  clic_mapa: VACIA,
  clic_tabla_cambios: VACIA,
  clic_tabla_atipicas: VACIA,
  ver_metodologia: VACIA,
  error_datos: /^(inicio|consulta|serie)$/,
  // reservados para los artículos y los formularios
  abrir_articulo: /^[a-z0-9-]{1,40}$/,
  comentario_enviado: VACIA,
  feedback_enviado: /^(error|idea|dato|otro)$/,
};

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };
const bien = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const mal = (error: string): Resultado<never> => ({ ok: false, error });

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Texto de una persona: sin caracteres de control, sin marcas que invierten el sentido de lectura ni espacios invisibles. */
export function limpiarTexto(entrada: unknown, min: number, max: number): string | null {
  if (typeof entrada !== "string") return null;
  const t = entrada
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[‪-‮⁦-⁩​-‍﻿]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.length >= min && t.length <= max ? t : null;
}

export const contarEnlaces = (t: string): number => (t.match(/https?:\/\/|www\./gi) ?? []).length;

const esApp = (x: unknown): x is (typeof APPS)[number] => typeof x === "string" && (APPS as readonly string[]).includes(x);

// ───────────────────────── eventos ─────────────────────────
export type EventoEntrada = { evento: string; propiedad: string; n: number };

export function validarEventos(entrada: unknown): Resultado<{ app: string; eventos: EventoEntrada[] }> {
  if (!esObjeto(entrada)) return mal("cuerpo_invalido");
  if (!esApp(entrada.app)) return mal("app_invalida");
  const lista = entrada.eventos;
  if (!Array.isArray(lista) || lista.length === 0) return mal("eventos_invalidos");
  if (lista.length > MAX_EVENTOS_LOTE) return mal("demasiados_eventos");
  const eventos: EventoEntrada[] = [];
  for (const e of lista) {
    if (!esObjeto(e) || typeof e.evento !== "string" || !NOMBRE_EVENTO.test(e.evento)) return mal("evento_invalido");
    const regla = EVENTOS_PERMITIDOS[e.evento];
    if (!regla) return mal("evento_desconocido");
    const propiedad = e.propiedad === undefined ? "" : e.propiedad;
    if (typeof propiedad !== "string" || !PROPIEDAD_EVENTO.test(propiedad) || !regla.test(propiedad)) return mal("propiedad_invalida");
    if (!Number.isInteger(e.n) || (e.n as number) < 1 || (e.n as number) > MAX_N_EVENTO) return mal("conteo_invalido");
    eventos.push({ evento: e.evento, propiedad, n: e.n as number });
  }
  return bien({ app: entrada.app, eventos });
}

// ───────────────────────── comentarios ─────────────────────────
export type ComentarioEntrada = { hilo: string; nombre: string; cuerpo: string; respuesta_a: string | null; app: string; turnstile: string; bot: boolean };

export function validarComentario(entrada: unknown): Resultado<ComentarioEntrada> {
  if (!esObjeto(entrada)) return mal("cuerpo_invalido");
  if (typeof entrada.hilo !== "string" || !HILO.test(entrada.hilo)) return mal("hilo_invalido");
  if (!esApp(entrada.app)) return mal("app_invalida");
  const nombre = limpiarTexto(entrada.nombre, 2, 60);
  if (nombre === null || nombre.includes("\n") || contarEnlaces(nombre) > 0) return mal("nombre_invalido");
  const cuerpo = limpiarTexto(entrada.cuerpo, 3, 2000);
  if (cuerpo === null) return mal("comentario_invalido");
  if (contarEnlaces(cuerpo) > MAX_ENLACES) return mal("demasiados_enlaces");
  let respuesta_a: string | null = null;
  if (entrada.respuesta_a !== undefined && entrada.respuesta_a !== null) {
    if (typeof entrada.respuesta_a !== "string" || !UUID.test(entrada.respuesta_a)) return mal("respuesta_invalida");
    respuesta_a = entrada.respuesta_a.toLowerCase();
  }
  const turnstile = typeof entrada.turnstile === "string" ? entrada.turnstile : "";
  if (turnstile.length < 1 || turnstile.length > 2048) return mal("verificacion_requerida");
  // campo trampa: invisible para las personas; si trae algo, es un robot
  const bot = typeof entrada.sitio_web === "string" ? entrada.sitio_web.length > 0 : entrada.sitio_web !== undefined && entrada.sitio_web !== null && entrada.sitio_web !== "";
  return bien({ hilo: entrada.hilo, nombre, cuerpo, respuesta_a, app: entrada.app, turnstile, bot });
}

// ───────────────────────── feedback ─────────────────────────
export type FeedbackEntrada = {
  app: string;
  ruta: string;
  tipo: (typeof TIPOS_FEEDBACK)[number];
  mensaje: string;
  contacto: string | null;
  consentimiento: boolean;
  turnstile: string;
  bot: boolean;
};

export function validarFeedback(entrada: unknown): Resultado<FeedbackEntrada> {
  if (!esObjeto(entrada)) return mal("cuerpo_invalido");
  if (!esApp(entrada.app)) return mal("app_invalida");
  if (typeof entrada.ruta !== "string" || !/^\/[A-Za-z0-9/_.-]{0,120}$/.test(entrada.ruta)) return mal("ruta_invalida");
  if (typeof entrada.tipo !== "string" || !(TIPOS_FEEDBACK as readonly string[]).includes(entrada.tipo)) return mal("tipo_invalido");
  const mensaje = limpiarTexto(entrada.mensaje, 3, 3000);
  if (mensaje === null) return mal("mensaje_invalido");
  if (contarEnlaces(mensaje) > MAX_ENLACES + 3) return mal("demasiados_enlaces");
  const consentimiento = entrada.consentimiento === true;
  let contacto: string | null = null;
  if (entrada.contacto !== undefined && entrada.contacto !== null && entrada.contacto !== "") {
    contacto = limpiarTexto(entrada.contacto, 3, 120);
    if (contacto === null || contacto.includes("\n")) return mal("contacto_invalido");
    if (!consentimiento) return mal("consentimiento_requerido");
  }
  const turnstile = typeof entrada.turnstile === "string" ? entrada.turnstile : "";
  if (turnstile.length < 1 || turnstile.length > 2048) return mal("verificacion_requerida");
  const bot = typeof entrada.sitio_web === "string" ? entrada.sitio_web.length > 0 : entrada.sitio_web !== undefined && entrada.sitio_web !== null && entrada.sitio_web !== "";
  return bien({ app: entrada.app, ruta: entrada.ruta, tipo: entrada.tipo as FeedbackEntrada["tipo"], mensaje, contacto, consentimiento, turnstile, bot });
}

// ───────────────────────── origen, IP y cupo ─────────────────────────
/** ¿Está el origen en la lista? Admite `*` dentro de un solo segmento del dominio (p. ej. https://dcc-portal-*.vercel.app para las vistas previas). */
export function origenPermitido(origen: string | null, permitidos: string[]): boolean {
  if (!origen) return false;
  const o = origen.replace(/\/+$/, "").toLowerCase();
  return permitidos.some((p) => {
    const patron = p.replace(/\/+$/, "").toLowerCase();
    if (!patron.includes("*")) return patron === o;
    const re = new RegExp("^" + patron.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+") + "$");
    return re.test(o);
  });
}

export function ipDe(cabeceras: Headers): string {
  const cf = cabeceras.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = cabeceras.get("x-forwarded-for");
  return xff ? xff.split(",")[0].trim() : "desconocida";
}

/** Clave de cupo: SHA-256 de sal + día + origen + tipo. No se guarda la IP, y mañana la misma persona produce otra clave. */
export async function claveDeCupo(sal: string, dia: string, ip: string, tipo: string): Promise<string> {
  const datos = new TextEncoder().encode(`${sal}|${dia}|${ip}|${tipo}`);
  const huella = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(huella)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Día en hora de Colombia (AAAA-MM-DD), el mismo criterio que usa la base. */
export function diaColombia(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}
