import type { Metadata } from "next";
import Observatorio from "@/components/observatorio/Observatorio";

export const metadata: Metadata = {
  title: "Observatorio de seguridad",
  description: "Denuncias de homicidio, lesiones y hurtos en Colombia: mapa de tasas, pronóstico, puntos calientes y semanas atípicas.",
};

export default function PaginaObservatorio() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
      <p className="eyebrow reveal">Caso 01 · Observatorio de seguridad</p>
      <h1 className="display reveal mt-3 max-w-4xl text-4xl font-semibold leading-[1.02] sm:text-6xl" style={{ animationDelay: ".08s" }}>
        ¿Dónde y cuándo se denuncian los delitos en Colombia?
      </h1>

      <aside className="reveal mt-8 max-w-3xl border-l-4 border-accent bg-paper2 p-5" style={{ animationDelay: ".16s" }} aria-label="Memo ejecutivo">
        <p className="eyebrow">Memo ejecutivo</p>
        <p className="mt-2 border border-dashed border-rule p-3 text-ink2">
          Pendiente: el autor lo redacta con estructura de pirámide (idea principal y tres argumentos) al cierre del caso. Mientras tanto, las cifras de abajo salen directamente de los datos publicados.
        </p>
      </aside>

      <Observatorio />
    </div>
  );
}
