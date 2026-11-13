import type { NivelSector } from "./tipos";

/** El código de la dirección define el nivel: una letra es una sección CIIU, dos dígitos una división y cuatro una clase. */
export function nivelDeCodigo(codigo: string): NivelSector | null {
  if (/^[A-U]$/.test(codigo)) return "seccion";
  if (/^\d{2}$/.test(codigo)) return "ciiu2";
  if (/^\d{4}$/.test(codigo)) return "ciiu4";
  return null;
}

/** Dimensión de `alerta_agregada` que corresponde a un nivel (las clases de 4 dígitos no se publican por separado: se usa su división). */
export function dimensionAlerta(nivel: NivelSector): "seccion" | "ciiu2" {
  return nivel === "seccion" ? "seccion" : "ciiu2";
}

export const tituloNivel: Record<NivelSector, string> = { seccion: "Sección CIIU", ciiu2: "División CIIU", ciiu4: "Clase CIIU" };
