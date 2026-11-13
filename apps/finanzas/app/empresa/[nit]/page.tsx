import type { Metadata } from "next";
import { Suspense } from "react";
import FichaPagina from "./FichaPagina";

export const metadata: Metadata = {
  title: "Ficha de sociedad",
  description: "Indicadores financieros, percentiles frente a sus pares y señales de una sociedad que reporta a la Supersociedades.",
  robots: { index: false }, // 44 mil fichas bajo demanda: no se ofrecen a los buscadores en bloque
};

// El NIT se lee en el navegador (useParams): la página es una cáscara estática y los datos vienen de R2 con DuckDB-WASM.
export default function Pagina() {
  return (
    <Suspense fallback={<div role="status" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 text-ink2">Cargando…</div>}>
      <FichaPagina />
    </Suspense>
  );
}
