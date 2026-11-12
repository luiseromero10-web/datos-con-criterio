const PASOS = ["Libro", "Marco", "Datos", "Hallazgo", "Recomendación"];

export default function Inicio() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
      <p className="eyebrow reveal">Portafolio de decisiones con datos abiertos</p>
      <h1 className="display reveal mt-4 max-w-4xl text-5xl font-semibold leading-[0.95] sm:text-7xl" style={{ animationDelay: ".08s" }}>
        Datos <span className="font-normal text-accent">con</span> criterio.
      </h1>
      <p className="reveal mt-6 max-w-2xl text-lg text-ink2 sm:text-xl" style={{ animationDelay: ".16s" }}>
        Casos reales con datos públicos de Colombia, donde cada cifra sirve para decidir algo. Cada caso sigue la misma ruta y termina en una recomendación, con sus límites a la vista.
      </p>

      <ol className="reveal mt-10 flex flex-wrap items-center gap-x-3 gap-y-2" style={{ animationDelay: ".24s" }} aria-label="Ruta de cada caso">
        {PASOS.map((p, i) => (
          <li key={p} className="flex items-center gap-3">
            <span className="mono border border-ink px-2.5 py-1 text-sm">{p}</span>
            {i < PASOS.length - 1 && <span aria-hidden="true" className="text-ink2">→</span>}
          </li>
        ))}
      </ol>

      <section className="mt-16" aria-labelledby="casos">
        <div className="rule-top pt-3">
          <p className="eyebrow">Casos</p>
          <h2 id="casos" className="display mt-1 text-3xl font-semibold">Para empezar</h2>
        </div>

        <a
          href="/seguridad"
          className="group mt-6 grid gap-4 border border-ink p-5 transition-colors hover:bg-paper2 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-8 sm:p-7"
        >
          <span className="display text-5xl font-semibold leading-none sm:text-6xl">01</span>
          <span>
            <span className="display block text-2xl font-semibold sm:text-3xl">Observatorio de seguridad</span>
            <span className="mt-1 block max-w-xl text-ink2">
              Denuncias de seis delitos en 1 100 municipios desde 2018: mapa de tasas, pronóstico a 16 semanas, puntos calientes y semanas atípicas.
            </span>
          </span>
          <span className="mono text-sm underline-offset-4 group-hover:underline">Abrir el caso →</span>
        </a>
        <p className="mt-4 text-sm text-ink2">Más casos en preparación.</p>
      </section>

      <section className="mt-16 grid gap-8 sm:grid-cols-2" aria-label="Cómo se hace">
        <div className="rule-top pt-3">
          <h2 className="display text-2xl font-semibold">Cómo se hace</h2>
          <p className="mt-2 text-ink2">
            Los datos se actualizan solos cada semana, el modelo se evalúa contra una línea base y todo el código es público. Si un resultado no supera a la línea base, se dice.
          </p>
        </div>
        <div className="rule-top pt-3">
          <h2 className="display text-2xl font-semibold">Lo que no hace</h2>
          <p className="mt-2 text-ink2">
            No usa datos privados ni inteligencia artificial de pago, y no señala culpables: las cifras son denuncias, con subregistro, y se leen con sus intervalos.
          </p>
        </div>
      </section>
    </div>
  );
}
