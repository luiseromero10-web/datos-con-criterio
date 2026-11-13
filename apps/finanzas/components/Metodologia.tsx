"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Aviso from "./Aviso";
import Comunidad from "./Comunidad";
import { leerMetricasAlerta } from "@/lib/consultas";
import { dos, porcentaje, tres } from "@/lib/format";
import { useBase } from "@/lib/usar";

type Metrica = { n: number; positivos: number; tasa_base: number; pr_auc: number; roc_auc: number; recall_5: number; precision_5: number; brier_skill: number; ic95?: { pr_auc: [number, number]; recall_5: [number, number] } };
type Modelos = Record<"altman" | "logit" | "lgbm", Record<"prueba" | "prueba_2023", Metrica>>;
const NOMBRES: Record<string, string> = { altman: "Z'' de Altman (línea base)", logit: "Regresión logística (línea base)", lgbm: "LightGBM (publicado)" };

function Seccion({ id, numero, titulo, children }: { id: string; numero: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="mt-12 max-w-3xl scroll-mt-20">
      <p className="eyebrow">{numero}</p>
      <h2 id={`${id}-t`} className="display mt-1 text-2xl sm:text-3xl">{titulo}</h2>
      <div className="mt-4 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

function TablaModelos({ modelos, clave, titulo }: { modelos: Modelos; clave: "prueba" | "prueba_2023"; titulo: string }) {
  return (
    <div tabIndex={0} className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <caption className="pb-2 text-left font-medium">{titulo}</caption>
        <thead>
          <tr className="border-b-2 border-ink">
            <th scope="col" className="py-2 pr-3 font-medium">Modelo</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">PR-AUC</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Recall en el 5 % de mayor riesgo</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Precisión en ese 5 %</th>
            <th scope="col" className="py-2 text-right font-medium">ROC-AUC</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(NOMBRES) as (keyof Modelos)[]).map((k) => {
            const m = modelos[k]?.[clave];
            if (!m) return null;
            return (
              <tr key={k} className="border-b border-rule">
                <th scope="row" className="py-2 pr-3 font-normal">{NOMBRES[k]}</th>
                <td className="mono py-2 pr-3 text-right">{tres(m.pr_auc)}{m.ic95 ? ` (${tres(m.ic95.pr_auc[0])}–${tres(m.ic95.pr_auc[1])})` : ""}</td>
                <td className="mono py-2 pr-3 text-right">{porcentaje(m.recall_5)}</td>
                <td className="mono py-2 pr-3 text-right">{porcentaje(m.precision_5)}</td>
                <td className="mono py-2 text-right">{tres(m.roc_auc)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Metodologia() {
  const base = useBase();
  const [modelos, setModelos] = useState<Modelos | null>(null);
  const [tasa, setTasa] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    leerMetricasAlerta()
      .then((m) => {
        if (!vivo) return;
        setModelos((m.metricas ?? null) as Modelos | null);
        const prueba = (m.metricas as Modelos | undefined)?.lgbm?.prueba;
        setTasa(prueba ? prueba.tasa_base : null);
      })
      .catch(() => vivo && setModelos(null));
    return () => {
      vivo = false;
    };
  }, []);

  const cat = base.estado === "listo" ? base.datos.cat : null;
  const meta = base.estado === "listo" ? base.datos.meta : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <header className="pt-10 sm:pt-12">
        <p className="eyebrow">Metodología</p>
        <h1 className="display mt-2 text-3xl font-semibold leading-tight sm:text-5xl">Cómo se calcula cada cifra</h1>
        <p className="mt-3 max-w-3xl text-ink2">
          Qué datos se usan, qué se mide, cómo se comparan las sociedades y qué no se puede concluir. Todo sale de datos abiertos; el código y las pruebas están en el repositorio.
        </p>
        <nav aria-label="En esta página" className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[["datos", "Datos"], ["indicadores", "Indicadores"], ["pares", "Pares y percentiles"], ["senales", "Señales"], ["pesos", "Pesos constantes"], ["modelo", "Perfil de riesgo agregado"], ["limites", "Límites"]].map(([id, t]) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center underline underline-offset-4">{t}</a>
          ))}
        </nav>
      </header>

      <Seccion id="datos" numero="01" titulo="Datos">
        <p>
          Estados de situación financiera, de resultados y de flujo de efectivo NIIF que las sociedades vigiladas reportan a la Supersociedades, publicados en datos.gov.co (conjuntos de grupo 1 y 2, cierres 2016–2025). Los valores originales vienen en miles de pesos y se convierten a pesos.
          {meta ? ` Los datos se generaron el ${meta.generado.slice(0, 10)}.` : ""}
        </p>
        <p>
          Cuando una sociedad presenta estados individuales y separados se usan los individuales; si solo existen separados, se usan esos y la ficha lo avisa. Los informes con errores evidentes de unidades (por ejemplo, cifras en pesos en lugar de miles) se marcan como atípicos y no entran a los agregados de sector.
          La información de contacto de la carátula (teléfonos, correos, direcciones) no se publica.
        </p>
        <p>Licencia de los datos y de esta publicación: {meta?.licencia ?? "CC BY-SA 4.0"}. {meta?.atribucion ?? ""}</p>
      </Seccion>

      <Seccion id="indicadores" numero="02" titulo="Los 16 indicadores">
        {cat ? (
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <caption className="sr-only">Definición de cada indicador</caption>
              <thead>
                <tr className="border-b-2 border-ink">
                  <th scope="col" className="py-2 pr-3 font-medium">Indicador</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Cálculo</th>
                  <th scope="col" className="py-2 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody>
                {cat.indicadores.map((i) => (
                  <tr key={i.id} className="border-b border-rule align-top">
                    <th scope="row" className="py-2 pr-3 font-medium">{i.nombre}</th>
                    <td className="py-2 pr-3">{i.formula}</td>
                    <td className="py-2 text-ink2">{i.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p role="status" className="text-ink2">Cargando definiciones…</p>
        )}
        {cat && (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 underline underline-offset-4">Por qué a veces un indicador aparece vacío</summary>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {Object.entries(cat.motivos).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          </details>
        )}
      </Seccion>

      <Seccion id="pares" numero="03" titulo="Pares y percentiles">
        <p>
          Cada sociedad se compara con otras del mismo sector y tamaño en el mismo año. El grupo de pares es la clase CIIU de cuatro dígitos dividida en tres tamaños (por ingresos); si algún grupo tiene pocas sociedades se sube a la división de dos dígitos y, como último recurso, a toda la división sin separar por tamaño.
          {cat ? ` Se exigen al menos ${cat.pares.minimo_por_tercil} sociedades por tamaño (${cat.pares.minimo_para_terciles} en el sector para dividirlo) y ${cat.pares.minimo_para_percentil} con dato para calcular un percentil.` : ""}
        </p>
        <p>
          El percentil de <em>desempeño</em> va de 0 a 100 y siempre significa «mejor cuanto más alto»: en indicadores donde menos es mejor (endeudamiento, por ejemplo) el percentil se invierte. Los días de proveedores no se juzgan como mejor o peor y no tienen percentil de desempeño.
          La CIIU solo está disponible desde el cierre 2020; antes de eso se hereda la del año más cercano.
        </p>
      </Seccion>

      <Seccion id="senales" numero="04" titulo="Señales objetivas">
        <p>Son hechos contables verificables en los estados, redactados sin juicio. Una señal no dice que la sociedad esté mal: dice que el dato aparece así en el informe.</p>
        {cat && (
          <ul className="list-disc pl-5">
            {cat.senales.map((s) => (
              <li key={s.id}>{s.texto}</li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion id="pesos" numero="05" titulo="Pesos constantes">
        {cat ? (
          <>
            <p>
              Para comparar años se reexpresan las cifras en pesos de {cat.pesos_constantes.anio_base} con el IPC total nacional del DANE: los flujos (ingresos, utilidades) con el {cat.pesos_constantes.flujos.toLowerCase()} y los saldos (activos, deudas) con el {cat.pesos_constantes.saldos.toLowerCase()}.
              Fuente: {cat.pesos_constantes.fuente}.
            </p>
            <div tabIndex={0} className="overflow-x-auto">
              <table className="w-full min-w-[26rem] border-collapse text-left text-sm">
                <caption className="sr-only">Índices de precios usados</caption>
                <thead>
                  <tr className="border-b-2 border-ink">
                    <th scope="col" className="py-2 pr-3 font-medium">Año</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">IPC diciembre</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">IPC promedio</th>
                    <th scope="col" className="py-2 text-right font-medium">Inflación a diciembre</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.pesos_constantes.ipc.map((r) => (
                    <tr key={r.anio} className="border-b border-rule">
                      <th scope="row" className="py-1 pr-3 font-normal">{r.anio}</th>
                      <td className="mono py-1 pr-3 text-right">{dos(r.ipc_dic)}</td>
                      <td className="mono py-1 pr-3 text-right">{dos(r.ipc_prom)}</td>
                      <td className="mono py-1 text-right">{r.variacion_diciembre !== null ? porcentaje(r.variacion_diciembre) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p role="status" className="text-ink2">Cargando…</p>
        )}
      </Seccion>

      <Seccion id="modelo" numero="06" titulo="Perfil de riesgo agregado (modelo)">
        <p>
          Un modelo estadístico (LightGBM) aprende, con los cierres 2016–2019, qué cifras tenían las sociedades que luego fueron admitidas a reorganización o liquidación en los dos años siguientes. Se valida con 2020–2021 y se prueba en 2022 y 2023, nunca mezclando años.
          Se comparó contra dos líneas base (Z&apos;&apos; de Altman y regresión logística) y se adoptó solo porque las superó en la prueba, según una regla fijada antes de ver los resultados.
        </p>
        <p>
          <strong>Qué se publica:</strong> únicamente la proporción de sociedades con perfil alto por sector, región y tamaño, en grupos de al menos 30 sociedades. <strong>No se publica el puntaje de ninguna sociedad</strong> y la ficha de una empresa no lo muestra: un puntaje individual se leería como una calificación y podría dañar a una empresa real.
        </p>
        {modelos ? (
          <div className="space-y-6 pt-2">
            <TablaModelos modelos={modelos} clave="prueba" titulo={`Prueba 2022${tasa !== null ? ` (tasa base de admisión: ${porcentaje(tasa)})` : ""}, con intervalo del 95 %`} />
            <TablaModelos modelos={modelos} clave="prueba_2023" titulo="Segunda prueba 2023" />
            <p className="text-sm text-ink2">PR-AUC de un modelo sin información = tasa base. Recall en el 5 %: de las sociedades que luego fueron admitidas, qué fracción queda entre el 5 % con mayor puntaje.</p>
          </div>
        ) : (
          <p role="status" className="text-ink2">Cargando resultados del modelo…</p>
        )}
        <p>
          Ficha completa del modelo (datos, variables, calibración, subgrupos y limitaciones): <a className="underline underline-offset-4" href="https://github.com/luiseromero10-web/datos-con-criterio/blob/main/models/finanzas/FICHA_ALERTA.md" rel="noreferrer">FICHA_ALERTA.md</a> en el repositorio.
        </p>
      </Seccion>

      <Seccion id="limites" numero="07" titulo="Lo que estas cifras no dicen">
        <ul className="list-disc space-y-2 pl-5">
          <li>Solo están las sociedades que reportan a la Supersociedades; no es el universo de empresas del país ni incluye a las vigiladas por otras superintendencias.</li>
          <li>Los estados son autorreportados. Pueden tener errores, reexpresiones o presentarse tarde; no se auditan aquí.</li>
          <li>Un indicador por debajo de la mediana del sector no significa que la sociedad esté mal gestionada: cada negocio tiene su estructura.</li>
          <li>El perfil de riesgo agregado no es una probabilidad de quiebra, no sirve para decidir crédito, contratación o relaciones comerciales con una empresa concreta, y no avisa con meses de anticipación: buena parte de las admisiones ocurre en los primeros meses, cuando apenas se presentan los estados.</li>
          <li>Esta página es de interés público y no constituye asesoría financiera, contable ni legal.</li>
        </ul>
        <p>
          Si encuentra un error, escríbalo en los comentarios de abajo o en el formulario. Volver a <Link className="underline underline-offset-4" href="/">la búsqueda</Link>.
        </p>
      </Seccion>

      <Aviso />
      <Comunidad />
    </div>
  );
}
