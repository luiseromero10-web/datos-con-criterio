import type { Metadata } from "next";
import { Suspense } from "react";
import SectorPagina from "./SectorPagina";

export const metadata: Metadata = {
  title: "Vista de sector",
  description: "Cifras agregadas de un sector CIIU: distribución de indicadores, crecimiento real y proporción de sociedades con perfil de riesgo alto.",
};

// El código del sector se lee en el navegador (useParams); los datos vienen de R2 con DuckDB-WASM.
export default function Pagina() {
  return (
    <Suspense fallback={<div role="status" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 text-ink2">Cargando…</div>}>
      <SectorPagina />
    </Suspense>
  );
}
