export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-ink2 sm:px-6">
        <p>
          Datos con Criterio · Luis E. Romero. Los datos son públicos (datos.gov.co y DANE). Las cifras miden denuncias, no delitos reales.
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-1">
          <a className="underline underline-offset-4" href="/privacidad">Privacidad</a>
          <a className="underline underline-offset-4" href="https://github.com/luiseromero10-web/datos-con-criterio">Código en GitHub</a>
        </p>
      </div>
    </footer>
  );
}
