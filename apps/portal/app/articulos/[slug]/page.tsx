import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Comentarios } from "@dcc/comunidad";
import { leerArticulo, slugsPublicados } from "@/lib/articulos";

// Ruta «bloqueante»: la página espera `params` antes de responder. Los artículos publicados se generan en el build, así que llegan armados.
// Limitación conocida: una dirección que no existe (o un borrador en producción) muestra la página 404 con `noindex`, pero con estado
// HTTP 200, porque la respuesta ya empezó a enviarse. No filtra nada del borrador.
export const instant = false;

// Con la caché de componentes activa, la lista de rutas no puede ir vacía. Si aún no hay artículos publicados se deja una ruta
// que no existe y responde 404.
export async function generateStaticParams() {
  const slugs = await slugsPublicados();
  return (slugs.length > 0 ? slugs : ["sin-articulos"]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/articulos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = await leerArticulo(slug);
  return a ? { title: a.meta.titulo, description: a.meta.resumen } : {};
}

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function Articulo({ params }: PageProps<"/articulos/[slug]">) {
  const { slug } = await params;
  const a = await leerArticulo(slug);
  if (!a) notFound();
  const { meta, Contenido } = a;
  return (
    <article className="mx-auto max-w-3xl px-4 pb-12 pt-10 sm:px-6 sm:pt-14">
      <p className="eyebrow">
        <Link href="/articulos" className="underline-offset-4 hover:underline">Artículos</Link>
      </p>
      <h1 className="display mt-3 text-3xl leading-[1.05] sm:text-5xl">{meta.titulo}</h1>
      <p className="mono mt-3 text-xs text-ink2">
        {fecha(meta.fecha)}
        {meta.estado === "borrador" && <span className="ml-3 border border-dashed border-senal px-1.5 py-0.5 text-senal">Borrador (solo visible en desarrollo)</span>}
      </p>
      <p className="mt-5 text-lg text-ink2">{meta.resumen}</p>
      <div className="mt-6 border-t border-rule">
        <Contenido />
      </div>
      <section className="mt-12 border-t-2 border-ink pt-6" aria-label="Comentarios del artículo">
        <Comentarios hilo={`articulo:${meta.slug}`} titulo="Comentarios sobre este artículo" />
      </section>
    </article>
  );
}
