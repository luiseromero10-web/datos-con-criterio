import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Artículos",
  description: "Análisis y notas que acompañan a cada herramienta de Datos con Criterio.",
};

export default function Articulos() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
      <p className="eyebrow">Artículos</p>
      <h1 className="display mt-3 text-4xl leading-[1.02] sm:text-6xl">Análisis que acompañan a cada herramienta</h1>
      <p className="mt-5 max-w-prose text-lg text-ink2">
        Cada herramienta responde una pregunta con datos; cada artículo explica el criterio detrás de la respuesta. Aquí aparecerán todos, y cada uno también se
        mostrará dentro de la herramienta a la que pertenece.
      </p>
      <p className="mt-8 max-w-prose border border-dashed border-rule p-4 text-ink2">Aún no hay artículos publicados.</p>
    </div>
  );
}
