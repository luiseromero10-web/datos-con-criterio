// Datos de cabecera (frontmatter) de un artículo y su validación. Módulo puro: sin Next ni sistema de archivos, para probarlo fácil.
// Un artículo mal escrito debe romper el build, no publicarse a medias.

export const APPS_VALIDAS = ["portal", "seguridad"] as const;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type EstadoArticulo = "borrador" | "publicado";

export type ArticuloMeta = {
  slug: string;
  titulo: string;
  /** AAAA-MM-DD */
  fecha: string;
  resumen: string;
  apps: string[];
  estado: EstadoArticulo;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** YAML convierte 2026-11-20 en una fecha; aquí se normaliza a texto AAAA-MM-DD. */
function comoFecha(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && FECHA.test(v)) {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
  }
  return null;
}

export function validarMeta(slug: string, crudo: unknown): ArticuloMeta {
  const falla = (motivo: string): never => {
    throw new Error(`Artículo «${slug}»: ${motivo}`);
  };
  // máx. 40: el evento `abrir_articulo:<slug>` del servidor no acepta más largo y descartaría el lote entero
  if (!SLUG.test(slug) || slug.length > 40) falla("el nombre del archivo debe ser un identificador en minúsculas, números y guiones (máx. 40).");
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return falla("falta el bloque de datos al inicio (frontmatter).");
  const m = crudo as Record<string, unknown>;

  const titulo = typeof m.titulo === "string" ? m.titulo.trim() : "";
  if (titulo.length < 3 || titulo.length > 140) falla("`titulo` debe tener entre 3 y 140 caracteres.");
  const resumen = typeof m.resumen === "string" ? m.resumen.trim() : "";
  if (resumen.length < 10 || resumen.length > 400) falla("`resumen` debe tener entre 10 y 400 caracteres.");
  const fecha = comoFecha(m.fecha);
  if (!fecha) falla("`fecha` debe ser una fecha válida AAAA-MM-DD.");
  if (m.estado !== "borrador" && m.estado !== "publicado") falla("`estado` debe ser «borrador» o «publicado».");

  const apps = m.apps === undefined ? [] : m.apps;
  if (!Array.isArray(apps) || apps.some((a) => typeof a !== "string" || !(APPS_VALIDAS as readonly string[]).includes(a))) {
    falla(`\`apps\` debe ser una lista con valores de: ${APPS_VALIDAS.join(", ")}.`);
  }

  return { slug, titulo, fecha: fecha as string, resumen, apps: [...new Set(apps as string[])], estado: m.estado as EstadoArticulo };
}

/** Qué artículos se muestran: los publicados siempre; los borradores solo cuando se pide (desarrollo). Más recientes primero. */
export function visibles(articulos: ArticuloMeta[], conBorradores: boolean): ArticuloMeta[] {
  return articulos
    .filter((a) => conBorradores || a.estado === "publicado")
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.slug.localeCompare(b.slug));
}

/** Entrada del índice público (`/articulos/indice.json`): solo lo necesario para listar, nunca el cuerpo. */
export type EntradaIndice = Pick<ArticuloMeta, "slug" | "titulo" | "fecha" | "resumen" | "apps">;

export function entradaIndice(a: ArticuloMeta): EntradaIndice {
  return { slug: a.slug, titulo: a.titulo, fecha: a.fecha, resumen: a.resumen, apps: a.apps };
}
