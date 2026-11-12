"use client";
import { APP, COMUNIDAD_APAGADA, ES_PRODUCCION, SITEKEY_TURNSTILE, URL_COMUNIDAD } from "./config";

/**
 *  simulacion  desarrollo: nada sale del equipo; los comentarios son de ejemplo y lo enviado no se guarda
 *  real        producción con NEXT_PUBLIC_COMUNIDAD_URL y clave de Turnstile
 *  inactivo    producción sin esa configuración, o NEXT_PUBLIC_COMUNIDAD=off: la app sigue funcionando y lo dice
 */
export type ModoComunidad = "simulacion" | "real" | "inactivo";

export function modoComunidad(): ModoComunidad {
  if (COMUNIDAD_APAGADA) return "inactivo";
  if (!ES_PRODUCCION) return "simulacion";
  return URL_COMUNIDAD && SITEKEY_TURNSTILE ? "real" : "inactivo";
}

export type ComentarioPublico = { id: string; nombre: string; cuerpo: string; respuesta_a: string | null; creado: string };
export type ResultadoLista = { ok: true; comentarios: ComentarioPublico[]; hayMas: boolean } | { ok: false; motivo: string };
export type ResultadoEnvio = { ok: true } | { ok: false; motivo: string; mensaje: string };

const MENSAJES: Record<string, string> = {
  nombre_invalido: "Revise el nombre: de 2 a 60 caracteres y sin enlaces.",
  comentario_invalido: "El comentario debe tener entre 3 y 2000 caracteres.",
  demasiados_enlaces: "Hay demasiados enlaces; deje como máximo 2.",
  verificacion_requerida: "Complete la verificación antes de enviar.",
  verificacion_fallida: "No se pudo confirmar que es una persona. Intente de nuevo.",
  limite_diario: "Ya envió varios mensajes hoy. Puede intentar de nuevo mañana.",
  consentimiento_requerido: "Para guardar su contacto, marque la autorización.",
  mensaje_invalido: "El mensaje debe tener entre 3 y 3000 caracteres.",
  contacto_invalido: "Revise el contacto: de 3 a 120 caracteres, en una sola línea.",
  respuesta_invalida: "No se puede responder a ese comentario.",
  cuerpo_demasiado_grande: "El mensaje es demasiado largo.",
};
const GENERICO = "No se pudo enviar por ahora. Intente más tarde.";
export const mensajeDeError = (codigo: string): string => MENSAJES[codigo] ?? GENERICO;

// ───────── simulación (solo desarrollo) ─────────
const EJEMPLOS: ComentarioPublico[] = [
  { id: "ejemplo-2", nombre: "Luis E. Romero", cuerpo: "Gracias por escribir. Esta es una respuesta de ejemplo del autor.", respuesta_a: "ejemplo-1", creado: "2026-11-10T16:20:00Z" },
  { id: "ejemplo-1", nombre: "Visitante de ejemplo", cuerpo: "Comentario de ejemplo (simulación): ¿se podrá comparar dos municipios?", respuesta_a: null, creado: "2026-11-10T15:05:00Z" },
];
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───────── transporte ─────────
async function pedir(camino: string, init?: RequestInit): Promise<{ estado: number; json: Record<string, unknown> | null }> {
  const r = await fetch(`${URL_COMUNIDAD}/${camino}`, { ...init, signal: AbortSignal.timeout(10_000) });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await r.json()) as Record<string, unknown>;
  } catch {
    /* respuesta sin cuerpo */
  }
  return { estado: r.status, json };
}

// text/plain evita la comprobación previa de CORS; la función lee el cuerpo como JSON.
const enviarJson = (camino: string, datos: unknown) =>
  pedir(camino, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(datos) });

export async function listarComentarios(hilo: string, antes?: string): Promise<ResultadoLista> {
  const modo = modoComunidad();
  if (modo === "inactivo") return { ok: false, motivo: "inactivo" };
  if (modo === "simulacion") {
    await pausa(250);
    return { ok: true, comentarios: EJEMPLOS, hayMas: false };
  }
  try {
    const q = new URLSearchParams({ hilo, limite: "20" });
    if (antes) q.set("antes", antes);
    const { estado, json } = await pedir(`comentarios?${q}`);
    if (estado !== 200 || !json) return { ok: false, motivo: "error" };
    return { ok: true, comentarios: (json.comentarios as ComentarioPublico[]) ?? [], hayMas: json.hay_mas === true };
  } catch {
    return { ok: false, motivo: "red" };
  }
}

export type DatosComentario = { hilo: string; nombre: string; cuerpo: string; turnstile: string; sitio_web: string };
export type DatosFeedback = { ruta: string; tipo: string; mensaje: string; contacto: string; consentimiento: boolean; turnstile: string; sitio_web: string };

async function enviar(camino: "comentarios" | "feedback", datos: Record<string, unknown>): Promise<ResultadoEnvio> {
  const modo = modoComunidad();
  if (modo === "inactivo") return { ok: false, motivo: "inactivo", mensaje: "Esta función no está disponible por ahora." };
  if (modo === "simulacion") {
    await pausa(300);
    return { ok: true };
  }
  try {
    const { estado, json } = await enviarJson(camino, { ...datos, app: APP });
    if (estado === 201) return { ok: true };
    const codigo = typeof json?.error === "string" ? json.error : "error";
    return { ok: false, motivo: codigo, mensaje: mensajeDeError(codigo) };
  } catch {
    return { ok: false, motivo: "red", mensaje: "No hay conexión con el servidor. Intente de nuevo." };
  }
}

export const enviarComentario = (d: DatosComentario) => enviar("comentarios", d);
export const enviarFeedback = (d: DatosFeedback) => enviar("feedback", d);

export async function contarComentarios(hilos: string[]): Promise<Record<string, number> | null> {
  const modo = modoComunidad();
  if (modo === "inactivo") return null;
  if (modo === "simulacion") return Object.fromEntries(hilos.map((h) => [h, 1]));
  try {
    const { estado, json } = await pedir(`conteos?hilos=${encodeURIComponent(hilos.join(","))}`);
    return estado === 200 && json ? (json.conteos as Record<string, number>) : null;
  } catch {
    return null;
  }
}
