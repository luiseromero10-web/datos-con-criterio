"use client";
import { useEffect } from "react";
import { trackUnaVez } from "./track";

/** Cuenta un evento una vez por carga de página (por defecto, `vista_app`). No pinta nada. */
export default function EventoVista({ evento = "vista_app", propiedad }: { evento?: string; propiedad?: string }) {
  useEffect(() => {
    trackUnaVez(evento, propiedad);
  }, [evento, propiedad]);
  return null;
}
