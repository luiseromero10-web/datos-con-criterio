import type { Metadata } from "next";
import Link from "next/link";
import { listarArticulos } from "@/lib/articulos";

export const metadata: Metadata = {
  title: "Artículos",
  description: "Análisis y notas que acompañan a cada herramienta de Datos con Criterio.",
};

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const NOMBRE_APP: Record<string, string> = { seguridad: "Observatorio de seguridad", portal: "Portal" };

export default async function Articulos() {
  const articulos = await listarArticulos();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
      <p className="eyebrow">Artículos</p>
      <h1 className="display mt-3 text-4xl leading-[1.02] sm:text-6xl">Análisis que acompañan a cada herramienta</h1>
      <p className="mt-5 max-w-prose text-lg text-ink2">
        Cada herramienta responde una pregunta con datos; cada artículo explica el criterio detrás de la respuesta. Aquí aparecen todos, y cada uno también se
        muestra dentro de la herramienta a la que pertenece.
      </p>

      {articulos.length === 0 ? (
        <p className="mt-8 max-w-prose border border-dashed border-rule p-4 text-ink2">Aún no hay artículos publicados.</p>
      ) : (
        <ul className="mt-8 divide-y divide-rule border-y border-rule">
          {articulos.map((a) => (
            <li key={a.slug} className="py-6">
              <p className="mono text-xs text-ink2">
                {fecha(a.fecha)}
                {a.estado === "borrador" && <span className="ml-3 border border-dashed border-senal px-1.5 py-0.5 text-senal">Borrador (solo visible en desarrollo)</span>}
              </p>
              <h2 className="display mt-2 text-2xl">
                <Link href={`/articulos/${a.slug}`} className="underline-offset-4 hover:underline">
                  {a.titulo}
                </Link>
              </h2>
              <p className="mt-2 max-w-prose text-ink2">{a.resumen}</p>
              {a.apps.length > 0 && <p className="mono mt-2 text-xs text-ink2">En: {a.apps.map((x) => NOMBRE_APP[x] ?? x).join(", ")}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
