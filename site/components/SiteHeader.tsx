import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <Link href="/" className="display flex items-center gap-2 text-lg leading-none sm:text-xl" aria-label="Datos con Criterio, inicio">
          <span aria-hidden="true" className="inline-block h-3.5 w-3.5 bg-accent" />
          <span>Datos <span className="font-normal text-accent">con</span> Criterio</span>
        </Link>
        <nav aria-label="Principal" className="flex gap-x-4 whitespace-nowrap text-sm sm:gap-x-5">
          <Link href="/casos/observatorio-seguridad" className="underline-offset-4 hover:underline">Observatorio</Link>
          <Link href="/casos/observatorio-seguridad/metodologia" className="underline-offset-4 hover:underline">Metodología</Link>
          <Link href="/sobre-mi" className="underline-offset-4 hover:underline">Sobre mí</Link>
        </nav>
      </div>
    </header>
  );
}
