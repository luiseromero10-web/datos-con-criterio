import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <Link href="/" className="display text-xl italic leading-none sm:text-2xl">
          Datos <span className="not-italic font-semibold">con</span> Criterio
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
