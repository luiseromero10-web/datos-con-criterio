"use client";
import { useEffect, useId, useState } from "react";
import { contarComentarios, modoComunidad } from "./api";
import Comentarios from "./Comentarios";
import { track } from "./track";

export type EntradaIndice = { slug: string; titulo: string; fecha: string; resumen: string; apps: string[] };

/** Lo que llega de `/articulos/indice.json`, sin fiarse de su forma: lo que no encaja se descarta. */
export function leerIndice(json: unknown, app: string): EntradaIndice[] {
  const lista = (json as { articulos?: unknown } | null)?.articulos;
  if (!Array.isArray(lista)) return [];
  const fuera: EntradaIndice[] = [];
  for (const x of lista) {
    const e = x as Partial<EntradaIndice> | null;
    if (!e || typeof e.slug !== "string" || !/^[a-z0-9-]{1,40}$/.test(e.slug)) continue;
    if (typeof e.titulo !== "string" || typeof e.resumen !== "string" || typeof e.fecha !== "string") continue;
    if (!Array.isArray(e.apps) || !e.apps.includes(app)) continue;
    fuera.push({ slug: e.slug, titulo: e.titulo, resumen: e.resumen, fecha: e.fecha, apps: e.apps.filter((a): a is string => typeof a === "string") });
  }
  return fuera;
}

const fecha = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/**
 * Artículos que acompañan a una herramienta. Lee el índice estático del portal (`/articulos/indice.json`, mismo dominio, sin costo de
 * función) y, si hay artículos, pide los conteos de comentarios en una sola llamada. Sin artículos o sin índice no muestra nada.
 * El enlace al artículo completo es un `<a>` común porque el artículo vive en otra zona: es un anexo, no parte de la herramienta.
 */
export default function ArticulosRelacionados({ app, indice = "/articulos/indice.json" }: { app: string; indice?: string }) {
  const uid = useId();
  const [articulos, setArticulos] = useState<EntradaIndice[]>([]);
  const [conteos, setConteos] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(indice, { signal: AbortSignal.timeout(8000) });
        if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return;
        const lista = leerIndice(await r.json(), app);
        if (!vivo || lista.length === 0) return;
        setArticulos(lista);
        const c = await contarComentarios(lista.map((a) => `articulo:${a.slug}`));
        if (vivo) setConteos(c);
      } catch {
        /* sin índice (p. ej. la herramienta abierta sola, fuera del portal): no se muestra la sección */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [app, indice]);

  if (articulos.length === 0) return null;
  const hayComunidad = modoComunidad() !== "inactivo";

  return (
    <section aria-labelledby={`${uid}-t`} className="mt-10 max-w-3xl">
      <h3 id={`${uid}-t`} className="display text-xl">Artículos sobre esta herramienta</h3>
      <ul className="mt-2 divide-y divide-rule border-y border-rule">
        {articulos.map((a) => {
          const n = conteos?.[`articulo:${a.slug}`];
          return (
            <li key={a.slug} className="py-4">
              <p className="mono text-xs text-ink2">{fecha(a.fecha)}</p>
              <p className="display mt-1 text-lg">
                <a href={`/articulos/${a.slug}`} onClick={() => track("abrir_articulo", a.slug)} className="underline underline-offset-4 hover:text-accent">
                  {a.titulo}
                </a>
              </p>
              <p className="mt-1 text-ink2">{a.resumen}</p>
              {hayComunidad && (
                <details className="mt-3">
                  <summary className="min-h-11 cursor-pointer py-2 underline-offset-4 hover:underline">
                    Comentarios{typeof n === "number" ? ` (${n})` : ""}
                  </summary>
                  <div className="mt-2">
                    <Comentarios hilo={`articulo:${a.slug}`} titulo="Comentarios sobre este artículo" />
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
