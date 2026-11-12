import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sobre mí" };

export default function SobreMi() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
      <p className="eyebrow">Sobre mí</p>
      <h1 className="display mt-3 text-4xl font-semibold leading-[1.02] sm:text-6xl">Luis E. Romero</h1>
      <p className="mt-6 max-w-prose border border-dashed border-rule p-4 text-ink2">
        Texto pendiente: lo redacta el autor (trayectoria, enfoque y contacto). Esta página queda como espacio reservado hasta entonces.
      </p>
    </div>
  );
}
