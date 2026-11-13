import type { Metadata } from "next";
import SectorLista from "@/components/SectorLista";

export const metadata: Metadata = {
  title: "Sectores",
  description: "Elija un sector CIIU para ver cómo se distribuyen los indicadores financieros de las sociedades que reportan a la Supersociedades.",
};

export default function Pagina() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
      <header className="pt-10 sm:pt-12">
        <p className="eyebrow">Vista de sector</p>
        <h1 className="display mt-2 text-3xl font-semibold leading-tight sm:text-5xl">Sectores</h1>
        <p className="mt-3 max-w-2xl text-ink2">Cifras agregadas por sección y división CIIU Rev. 4 A.C.: tamaño, crecimiento real, distribución de indicadores y proporción de sociedades con perfil de riesgo alto.</p>
      </header>
      <SectorLista />
    </div>
  );
}
