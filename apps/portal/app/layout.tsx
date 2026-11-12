import type { Metadata } from "next";
import "./globals.css";
import { clasesFuentes } from "@dcc/marca/fuentes";
import { SiteFooter, SiteHeader } from "@dcc/marca/componentes";

export const metadata: Metadata = {
  title: { default: "Datos con Criterio", template: "%s · Datos con Criterio" },
  description: "Casos de decisión con datos abiertos de Colombia: libro, marco, datos, hallazgo y recomendación.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={clasesFuentes}>
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
