"use client";
import { useEffect, useState } from "react";
import { cargarFicha, leerCatalogos, leerMetadatos, type Resultado } from "./consultas";
import type { Catalogos, Ficha, Metadatos } from "./tipos";

export type Carga<T> = { estado: "cargando" } | { estado: "error"; mensaje: string } | { estado: "listo"; datos: T };

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : "No se pudieron leer los datos. Revise su conexión e intente de nuevo.";
}

/** Catálogos (definiciones de indicadores y señales) y metadatos (fecha de los datos, fuentes y licencia). */
export function useBase(): Carga<{ cat: Catalogos; meta: Metadatos }> {
  const [c, setC] = useState<Carga<{ cat: Catalogos; meta: Metadatos }>>({ estado: "cargando" });
  useEffect(() => {
    let vivo = true;
    Promise.all([leerCatalogos(), leerMetadatos()])
      .then(([cat, meta]) => vivo && setC({ estado: "listo", datos: { cat, meta } }))
      .catch((e) => vivo && setC({ estado: "error", mensaje: mensaje(e) }));
    return () => {
      vivo = false;
    };
  }, []);
  return c;
}

/** La ficha de una sociedad; `null` si no existe. */
export function useFicha(nit: string | null): Carga<Ficha | null> {
  const [c, setC] = useState<{ nit: string | null; v: Carga<Ficha | null> }>({ nit, v: { estado: "cargando" } });
  useEffect(() => {
    if (!nit) return;
    let vivo = true;
    cargarFicha(nit)
      .then((f) => vivo && setC({ nit, v: { estado: "listo", datos: f } }))
      .catch((e) => vivo && setC({ nit, v: { estado: "error", mensaje: mensaje(e) } }));
    return () => {
      vivo = false;
    };
  }, [nit]);
  if (!nit) return { estado: "listo", datos: null };
  return c.nit === nit ? c.v : { estado: "cargando" }; // al cambiar de sociedad no se muestra la anterior
}

export type { Resultado };
