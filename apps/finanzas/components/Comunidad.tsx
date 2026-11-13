"use client";
import { ArticulosRelacionados, Comentarios, FormularioFeedback } from "@dcc/comunidad";

/** Comentarios públicos (con moderación previa), feedback privado y artículos relacionados: los mismos bloques de todas las apps. */
export default function Comunidad() {
  return (
    <section id="opinion" className="mt-14" aria-labelledby="titulo-opinion">
      <p className="eyebrow">Su opinión</p>
      <h2 id="titulo-opinion" className="display mt-1 text-2xl sm:text-3xl">Comentarios, correcciones y feedback</h2>
      <p className="mt-2 max-w-3xl text-sm text-ink2">
        Si una cifra no coincide con la que usted conoce de una sociedad, cuéntenos en el feedback: es privado y sirve para corregir. Nunca se publican datos de contacto de las sociedades.
      </p>
      <div className="mt-6 grid gap-12 lg:grid-cols-2">
        <Comentarios hilo="app:finanzas" titulo="Comentarios sobre esta herramienta" />
        <FormularioFeedback />
      </div>
      <ArticulosRelacionados app="finanzas" />
    </section>
  );
}
