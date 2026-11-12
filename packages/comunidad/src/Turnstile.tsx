"use client";
import { useEffect, useRef } from "react";
import { SITEKEY_TURNSTILE } from "./config";
import { modoComunidad } from "./api";

type ApiTurnstile = {
  render(el: HTMLElement, opciones: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let cargando: Promise<void> | null = null;

function cargarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!cargando) {
    cargando = new Promise((resolver, rechazar) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => resolver();
      s.onerror = () => {
        cargando = null;
        rechazar(new Error("No se pudo cargar la verificación"));
      };
      document.head.appendChild(s);
    });
  }
  return cargando;
}

/**
 * Verificación de que quien escribe es una persona (Cloudflare Turnstile; no pide resolver imágenes ni identifica a nadie).
 * `reinicio` cambia cuando el formulario se envía, para pedir un token nuevo (cada token sirve una sola vez).
 * En simulación (desarrollo) no carga nada y entrega un token de mentira.
 */
export default function Turnstile({ onToken, reinicio = 0 }: { onToken: (token: string | null) => void; reinicio?: number }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const aviso = useRef(onToken);
  useEffect(() => {
    aviso.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (modoComunidad() === "simulacion") {
      aviso.current("simulacion");
      return;
    }
    let vivo = true;
    cargarScript()
      .then(() => {
        if (!vivo || !contenedor.current || !window.turnstile) return;
        id.current = window.turnstile.render(contenedor.current, {
          sitekey: SITEKEY_TURNSTILE,
          language: "es",
          theme: "auto",
          callback: (t: string) => aviso.current(t),
          "expired-callback": () => aviso.current(null),
          "error-callback": () => aviso.current(null),
        });
      })
      .catch(() => aviso.current(null));
    return () => {
      vivo = false;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, []);

  useEffect(() => {
    if (reinicio > 0 && id.current && window.turnstile) {
      aviso.current(null);
      window.turnstile.reset(id.current);
    }
  }, [reinicio]);

  if (modoComunidad() === "simulacion") return null;
  return <div ref={contenedor} className="min-h-[65px]" />;
}
