import type { Metadata } from "next";
import MetricasModelo from "@/components/observatorio/MetricasModelo";

export const metadata: Metadata = {
  title: "Metodología",
  description: "Fuentes, limpieza, modelos, evaluación y límites del Observatorio de seguridad.",
};

function Bloque({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-labelledby={`m-${n}`}>
      <div className="rule-top pt-3">
        <p className="eyebrow">{n}</p>
        <h2 id={`m-${n}`} className="display mt-1 text-2xl font-semibold sm:text-3xl">{titulo}</h2>
      </div>
      <div className="mt-4 max-w-prose space-y-3 text-ink">{children}</div>
    </section>
  );
}

export default function Metodologia() {
  return (
    <article className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
      <p className="eyebrow">Caso 01 · Observatorio de seguridad</p>
      <h1 className="display mt-3 text-4xl font-semibold leading-[1.02] sm:text-6xl">Metodología y límites</h1>
      <p className="mt-5 max-w-prose text-lg text-ink2">Qué datos se usan, cómo se limpian, qué predice el modelo, qué tan bien lo hace y qué no debe hacerse con él.</p>

      <Bloque n="01" titulo="Datos">
        <p>
          Denuncias registradas en el Sistema de Información Estadístico, Delincuencial, Contravencional y Operativo (SIEDCO) de la Policía Nacional, publicadas en datos.gov.co por el Ministerio de Defensa (Observatorio del Delito).
          Seis delitos: homicidio, lesiones personales, hurto a personas, a comercio, a residencias y de vehículos, de enero de 2018 en adelante.
        </p>
        <p>Población municipal: proyecciones del DANE (base censo 2018). Límites municipales: Marco Geoestadístico Nacional del DANE, versión 2018. Catálogo de municipios: DIVIPOLA.</p>
        <p>Los datos se descargan cada semana, se validan y solo se publican si pasan las validaciones: esquema, frescura, caída semana contra semana y coherencia entre capas.</p>
      </Bloque>

      <Bloque n="02" titulo="Problemas de los datos">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Subregistro:</strong> son denuncias, no delitos reales. Un cambio en la disposición a denunciar parece un cambio en el delito.</li>
          <li><strong>Registro tardío:</strong> las últimas semanas se completan después. Se tratan como provisionales las 8 más recientes, un supuesto prudente que se revisará cuando haya varias cargas para medirlo.</li>
          <li><strong>Cambios de criterio:</strong> hurto a comercio y a residencias tienen saltos de nivel en 2016-2017 que parecen cambios de registro. Por eso el análisis parte de 2018.</li>
          <li><strong>Series intermitentes:</strong> en la mayoría de los municipios hay pocas denuncias por semana. El pronóstico semanal municipal se hace solo donde el promedio es de al menos 2 por semana; el resto se ve a nivel departamental.</li>
        </ul>
      </Bloque>

      <Bloque n="03" titulo="Pronóstico">
        <p>
          Para cada serie (departamental siempre, municipal con volumen) se pronostican 16 semanas desde la última semana confiable, con un intervalo del 80 % calibrado con los errores reales del backtest.
          Las primeras 8 semanas cubren el periodo provisional y las siguientes llegan al futuro.
        </p>
        <p>
          Se compararon dos líneas base (estacional de 52 semanas y media móvil de 4) con AutoETS, AutoTheta, TSB y LightGBM, evaluados con origen rodante en 12 cortes, nunca con validación aleatoria.
          El método y los intervalos se eligen con los cortes más antiguos; las cifras de abajo son de los más recientes.
        </p>
        <p>
          Un resultado a tener presente: el método que gana es TSB, que produce un nivel plano. No capta estacionalidad ni festivos. LightGBM sí los usa y no ganó.
        </p>
      </Bloque>

      <section className="mt-8" aria-label="Métricas del modelo vigente">
        <MetricasModelo />
      </section>

      <Bloque n="04" titulo="Puntos calientes y semanas atípicas">
        <p>
          <strong>Puntos calientes:</strong> estadístico Getis-Ord Gi* sobre tasas por 100 000 habitantes suavizadas con Bayes empírico (para que los municipios pequeños no dominen), con vecindad por contigüidad y corrección de falsos descubrimientos al 5 %.
          Se comparan los últimos 12 meses con los 12 anteriores: emergente, persistente o en disminución. La corrección es conservadora, así que hay pocos puntos calientes y ninguno frío.
        </p>
        <p>
          <strong>Semanas atípicas:</strong> el valor semanal frente a la mediana de las 26 semanas anteriores, estandarizado con una desviación robusta de la propia serie; se marca cuando el puntaje absoluto supera 3.
          Una semana atípica pide mirar el contexto (un paro, un confinamiento, un cambio de calendario), no sacar una conclusión.
        </p>
      </Bloque>

      <Bloque n="05" titulo="Límites y uso responsable">
        <ul className="list-disc space-y-2 pl-5">
          <li>No sirve para señalar municipios como «peligrosos». Compare tasas y use los intervalos, no un valor puntual.</li>
          <li>No es una estimación causal: no dice qué pasaría con más o menos vigilancia.</li>
          <li>En municipios con pocas denuncias el intervalo es muy ancho en proporción; un número pequeño no autoriza decisiones individuales.</li>
          <li>El modelo no anticipa cambios de política, pandemias ni eventos extraordinarios.</li>
          <li>La evaluación puede ser algo optimista, porque al comparar alternativas se miraron también los cortes de evaluación. Cada entrenamiento mensual la vuelve a medir con datos nuevos.</li>
        </ul>
      </Bloque>

      <Bloque n="06" titulo="Código y datos">
        <p>
          Todo el código y las decisiones de diseño son públicos:{" "}
          <a className="underline underline-offset-4" href="https://github.com/luiseromero10-web/datos-con-criterio">github.com/luiseromero10-web/datos-con-criterio</a>.
          La ficha completa del modelo está en <code className="mono">models/seguridad/FICHA_PRONOSTICO.md</code>.
        </p>
      </Bloque>
    </article>
  );
}
