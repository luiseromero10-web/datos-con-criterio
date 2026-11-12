import type { Metadata } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

// Archivo (Omnibus-Type, Argentina): variable en ancho y peso; titulares expandidos, texto normal.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });
// Martian Mono: etiquetas técnicas y cifras pequeñas.
const martian = Martian_Mono({ variable: "--font-martian", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Datos con Criterio", template: "%s · Datos con Criterio" },
  description: "Casos de decisión con datos abiertos de Colombia: libro, marco, datos, hallazgo y recomendación.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${archivo.variable} ${martian.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
