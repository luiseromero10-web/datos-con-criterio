"use client";
import { publicar } from "./almacen";
import { APAGADO, APP, ES_PRODUCCION, URL_EVENTOS } from "./config";
import { crearRastreador, pidioNoRastrear, type Carga } from "./rastreador";

/**
 *  apagado     interruptor NEXT_PUBLIC_EVENTOS=off
 *  simulacion  desarrollo: los eventos y los lotes solo se muestran (panel y consola); nunca salen del equipo
 *  real        producción con NEXT_PUBLIC_EVENTOS_URL: se envían lotes agregados
 *  inactivo    producción sin URL: no se hace nada
 */
export type Modo = "apagado" | "simulacion" | "real" | "inactivo";

export function modo(): Modo {
  if (APAGADO) return "apagado";
  if (!ES_PRODUCCION) return "simulacion";
  return URL_EVENTOS ? "real" : "inactivo";
}

export function respetaNoRastrear(): boolean {
  if (typeof navigator === "undefined") return false;
  return pidioNoRastrear(
    navigator as Navigator & { globalPrivacyControl?: boolean },
    typeof window !== "undefined" ? (window as unknown as { doNotTrack?: string | null }) : undefined,
  );
}

const etiqueta = (e: string, p: string) => (p ? `${e}:${p}` : e);

function transportar(carga: Carga, lote: number): void {
  const resumen = carga.eventos.map((e) => `${etiqueta(e.evento, e.propiedad)} ×${e.n}`).join(", ");
  if (modo() === "simulacion") {
    publicar({}, { tipo: "lote", texto: `lote ${lote}: ${resumen}` });
    console.info("[eventos · simulación] lote", lote, JSON.stringify(carga));
    return;
  }
  const cuerpo = JSON.stringify(carga);
  // text/plain evita la comprobación previa de CORS (preflight); la función lee el cuerpo como JSON.
  const tipo = "text/plain;charset=UTF-8";
  const enviado = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(URL_EVENTOS, new Blob([cuerpo], { type: tipo }));
  if (!enviado) {
    fetch(URL_EVENTOS, { method: "POST", body: cuerpo, headers: { "Content-Type": tipo }, keepalive: true, mode: "cors" }).catch(() => {
      /* la analítica nunca debe romper la app */
    });
  }
}

let instancia: ReturnType<typeof crearRastreador> | null = null;

function rastreador() {
  if (instancia) return instancia;
  const sincronizar = () => {
    const e = instancia!.estado();
    publicar({ lotes: e.lotes, maxLotes: e.maxLotes, pendientes: e.pendientes, noRastrear: respetaNoRastrear() });
  };
  instancia = crearRastreador({
    app: APP,
    activo: () => modo() !== "apagado" && modo() !== "inactivo" && !respetaNoRastrear(),
    enviar: (carga, lote) => {
      transportar(carga, lote);
      sincronizar();
    },
    alRegistrar: (e, p) => {
      publicar({}, { tipo: "evento", texto: etiqueta(e, p) });
      sincronizar();
    },
    alDescartar: (motivo, e, p) => {
      if (modo() === "simulacion") publicar({ noRastrear: respetaNoRastrear() }, { tipo: "descartado", texto: `${etiqueta(e, p)} (${motivo.replace(/_/g, " ")})` });
    },
  });
  if (typeof window !== "undefined") {
    // al salir de la página se envía lo pendiente (sendBeacon sobrevive a la descarga)
    window.addEventListener("pagehide", () => instancia?.vaciar());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") instancia?.vaciar();
    });
  }
  return instancia;
}

export function track(evento: string, propiedad?: string): void {
  try {
    rastreador().track(evento, propiedad);
  } catch {
    /* la analítica nunca debe romper la app */
  }
}

export function trackUnaVez(evento: string, propiedad?: string): void {
  try {
    rastreador().trackUnaVez(evento, propiedad);
  } catch {
    /* ídem */
  }
}

/** Envía ya lo que haya en cola (el panel lo usa para no esperar los 10 s). */
export function vaciarYa(): void {
  rastreador().vaciar();
}
