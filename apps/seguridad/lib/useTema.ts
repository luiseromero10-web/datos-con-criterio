"use client";
import { useSyncExternalStore } from "react";

/** Tema del sistema (claro/oscuro) para los gráficos y el mapa, que pintan con colores resueltos en JS. */
export function useTema(): "claro" | "oscuro" {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro"),
    () => "claro",
  );
}

export function cssVar(nombre: string, respaldo: string): string {
  if (typeof window === "undefined") return respaldo;
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || respaldo;
}
