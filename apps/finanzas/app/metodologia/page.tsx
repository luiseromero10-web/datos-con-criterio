import type { Metadata } from "next";
import Metodologia from "@/components/Metodologia";

export const metadata: Metadata = {
  title: "Metodología",
  description: "Datos, indicadores, pares, percentiles, señales, pesos constantes y modelo de perfil de riesgo agregado de la Radiografía Financiera.",
};

export default function Pagina() {
  return <Metodologia />;
}
