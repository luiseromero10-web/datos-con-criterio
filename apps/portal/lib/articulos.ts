// Lectura de los artículos MDX (solo servidor, en el build). Viven en content/articulos/<slug>.mdx en la raíz del repositorio.
import fs from "node:fs";
import path from "node:path";
import type { ComponentType } from "react";
import { validarMeta, visibles, type ArticuloMeta } from "./articulo-meta";

const CARPETA = path.join(process.cwd(), "..", "..", "content", "articulos");

/** Los borradores se ven solo al desarrollar: en producción no se publican ni figuran en ningún índice. */
export const CON_BORRADORES = process.env.NODE_ENV !== "production";

type Modulo = { default: ComponentType<{ components?: Record<string, unknown> }>; frontmatter?: unknown };

const cargarModulo = (slug: string) => import(`../../../content/articulos/${slug}.mdx`) as Promise<Modulo>;

function slugsEnDisco(): string[] {
  if (!fs.existsSync(CARPETA)) return [];
  return fs
    .readdirSync(CARPETA)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.slice(0, -4));
}

/** Todos los artículos visibles, con sus datos validados (un error de redacción rompe el build). */
export async function listarArticulos(): Promise<ArticuloMeta[]> {
  const metas = await Promise.all(slugsEnDisco().map(async (slug) => validarMeta(slug, (await cargarModulo(slug)).frontmatter)));
  return visibles(metas, CON_BORRADORES);
}

export async function slugsPublicados(): Promise<string[]> {
  return (await listarArticulos()).map((a) => a.slug);
}

export async function leerArticulo(slug: string): Promise<{ meta: ArticuloMeta; Contenido: Modulo["default"] } | null> {
  if (!slugsEnDisco().includes(slug)) return null;
  const modulo = await cargarModulo(slug);
  const meta = validarMeta(slug, modulo.frontmatter);
  if (!CON_BORRADORES && meta.estado !== "publicado") return null;
  return { meta, Contenido: modulo.default };
}
