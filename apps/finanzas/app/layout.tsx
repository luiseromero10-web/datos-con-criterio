import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { clasesFuentes } from "@dcc/marca/fuentes";
import { SiteFooter, SiteHeader } from "@dcc/marca/componentes";
import { AnaliticaVisitas, EventoVista, PanelEventosDev } from "@dcc/comunidad";
import NavApp from "@/components/NavApp";

export const metadata: Metadata = {
  title: { default: "Radiografía financiera de empresas · Datos con Criterio", template: "%s · Datos con Criterio" },
  description: "Estados financieros de las sociedades que reportan a la Supersociedades: indicadores, comparación con sus pares, sectores y señales, 2016–2025.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={clasesFuentes}>
      <body className="min-h-dvh flex flex-col">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
          Saltar al contenido
        </a>
        <SiteHeader />
        <Suspense fallback={<div className="h-12 border-b border-rule" aria-hidden />}>
          <NavApp />
        </Suspense>
        <main id="contenido" className="flex-1">{children}</main>
        <SiteFooter />
        {/* Conteo de visitas (Cloudflare, solo producción), vista de la app y panel de simulación (solo desarrollo) */}
        <AnaliticaVisitas />
        <EventoVista />
        <PanelEventosDev />
      </body>
    </html>
  );
}
