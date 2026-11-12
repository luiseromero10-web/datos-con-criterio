/**
 * Cabecera común de todas las apps. Usa <a> y no <Link>: cada destino puede ser otra zona (otro proyecto de Vercel),
 * y Next intentaría hacer una navegación suave que no existe entre zonas.
 */
export const NAV_PRINCIPAL = [
  { href: "/seguridad", texto: "Observatorio" },
  { href: "/articulos", texto: "Artículos" },
  { href: "/sobre-mi", texto: "Sobre mí" },
] as const;

export default function SiteHeader() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <a href="/" className="display flex items-center gap-2 text-lg leading-none sm:text-xl" aria-label="Datos con Criterio, inicio">
          <span aria-hidden="true" className="inline-block h-3.5 w-3.5 bg-accent" />
          <span>
            Datos <span className="font-normal text-accent">con</span> Criterio
          </span>
        </a>
        <nav aria-label="Principal" className="flex gap-x-4 whitespace-nowrap text-sm sm:gap-x-5">
          {NAV_PRINCIPAL.map((n) => (
            <a key={n.href} href={n.href} className="underline-offset-4 hover:underline">
              {n.texto}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
