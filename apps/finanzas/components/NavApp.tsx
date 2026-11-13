"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/", texto: "Buscar", activo: (p: string) => p === "/" || p.startsWith("/empresa") },
  { href: "/comparar", texto: "Comparar", activo: (p: string) => p.startsWith("/comparar") },
  { href: "/sector", texto: "Sectores", activo: (p: string) => p.startsWith("/sector") },
  { href: "/metodologia", texto: "Metodología", activo: (p: string) => p.startsWith("/metodologia") },
];

/** Navegación interna de la app (dentro de la zona: enlaces suaves con <Link>). Next quita el basePath de `usePathname`. */
export default function NavApp() {
  const p = usePathname() ?? "/";
  return (
    <nav aria-label="Radiografía financiera" className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 px-4 sm:px-6">
        <span className="eyebrow mr-3 py-3">Radiografía financiera</span>
        {ENLACES.map((e) => {
          const act = e.activo(p);
          return (
            <Link key={e.href} href={e.href} aria-current={act ? "page" : undefined} className={`inline-flex min-h-11 items-center px-3 text-sm underline-offset-4 hover:underline ${act ? "border-b-2 border-accent font-semibold" : ""}`}>
              {e.texto}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
