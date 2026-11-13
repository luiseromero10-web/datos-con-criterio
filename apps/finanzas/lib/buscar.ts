/** Normaliza lo que escribe la persona: minúsculas, sin tildes ni signos, espacios simples (el mismo trato que `strip_accents` en la consulta). */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Consulta = { tipo: "nit"; nit: string } | { tipo: "texto"; texto: string } | { tipo: "vacia" };

/**
 * Un NIT (con o sin puntos y guion; el dígito de verificación tras el guion no hace parte del NIT guardado) o un texto.
 * Con menos de 3 letras o 4 dígitos todavía no se busca.
 */
export function interpretar(entrada: string): Consulta {
  const limpio = entrada.trim();
  if (!limpio) return { tipo: "vacia" };
  const soloDigitos = limpio.replace(/[.\s-]/g, "");
  if (/^\d+$/.test(soloDigitos)) {
    const conDv = /^\d{1,3}(\.\d{3}){2}-\d$/.test(limpio) || /^\d{9}-\d$/.test(limpio);
    const nit = conDv ? soloDigitos.slice(0, -1) : soloDigitos;
    return nit.length >= 4 ? { tipo: "nit", nit } : { tipo: "vacia" };
  }
  const t = normalizar(limpio);
  return t.length >= 3 ? { tipo: "texto", texto: t } : { tipo: "vacia" };
}

/** Texto para un `LIKE` de SQL: sin comodines ni comillas que cambien la consulta. */
export const paraLike = (t: string) => t.replace(/[%_\\']/g, "");
