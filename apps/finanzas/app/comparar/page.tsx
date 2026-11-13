import type { Metadata } from "next";
import { Suspense } from "react";
import Comparar from "@/components/Comparar";

export const metadata: Metadata = {
  title: "Comparar dos sociedades",
  description: "Compare los indicadores financieros de dos sociedades: araña, tabla y lectura en palabras.",
};

// La comparación vive en la dirección (?a=NIT&b=NIT), que solo se conoce en el navegador: va dentro de Suspense.
export default function Pagina() {
  return (
    <Suspense fallback={<div role="status" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 text-ink2">Cargando…</div>}>
      <Comparar />
    </Suspense>
  );
}
