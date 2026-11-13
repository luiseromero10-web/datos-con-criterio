"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@dcc/comunidad";
import Aviso from "./Aviso";
import BandaSector from "./BandaSector";
import Comunidad from "./Comunidad";
import Serie, { type SerieLinea } from "./Serie";
import { cargarSector, codigoSeguro, type DatosSector } from "@/lib/consultas";
import { entero, porcentaje, pesos } from "@/lib/format";
import { nivelDeCodigo, tituloNivel } from "@/lib/sectores";
import type { NivelSector } from "@/lib/tipos";
import { useBase } from "@/lib/usar";

const MUESTRA_TEXTO: Record<string, string> = {
  entrenamiento: "años de entrenamiento del modelo",
  validacion: "años de validación del modelo",
  prueba: "años de prueba (el modelo no los vio)",
  sin_etiqueta: "años sin etiqueta todavía (no han pasado 24 meses)",
};

function Kpi({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="panel p-4">
      <p className="eyebrow">{etiqueta}</p>
      <p className="cifra mt-2 break-words">{valor}</p>
      {nota && <p className="mt-2 text-xs text-ink2">{nota}</p>}
    </div>
  );
}

function Seccion({ id, numero, titulo, children }: { id: string; numero: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="mt-12">
      <p className="eyebrow">{numero}</p>
      <h2 id={`${id}-t`} className="display mt-1 text-2xl sm:text-3xl">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SectorVista({ codigo }: { codigo: string }) {
  const base = useBase();
  const nivel = nivelDeCodigo(codigo) as NivelSector | null;
  const valido = nivel && codigoSeguro(codigo);
  const [datos, setDatos] = useState<{ codigo: string; d: DatosSector | null } | { codigo: string; error: string } | null>(null);
  const [indicador, setIndicador] = useState("margen_operacional");

  useEffect(() => {
    if (!valido || !nivel) return;
    let vivo = true;
    cargarSector(nivel, codigo)
      .then((d) => {
        if (!vivo) return;
        setDatos({ codigo, d });
        track("ver_sector", codigo);
      })
      .catch((e) => vivo && setDatos({ codigo, error: e instanceof Error ? e.message : "Error de lectura" }));
    return () => {
      vivo = false;
    };
  }, [codigo, nivel, valido]);

  if (!valido || !nivel)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="display text-3xl">Sector no válido</h1>
        <p className="mt-3 text-ink2">El código debe ser una letra de sección (por ejemplo G), una división de dos dígitos (47) o una clase de cuatro (4711).</p>
        <p className="mt-4"><Link className="underline underline-offset-4" href="/sector">Ver todos los sectores</Link></p>
      </div>
    );
  const actual = datos && datos.codigo === codigo ? datos : null;
  if (base.estado === "cargando" || !actual) return <div role="status" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 text-ink2">Cargando el sector… (la primera vez tarda unos segundos)</div>;
  if (base.estado === "error" || "error" in actual)
    return <div role="alert" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">No se pudo cargar el sector. {base.estado === "error" ? base.mensaje : (actual as { error: string }).error} Recargue la página.</div>;
  const d = actual.d;
  if (!d)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="display text-3xl">Sector sin cifras publicadas</h1>
        <p className="mt-3 text-ink2">Los sectores con menos de 15 sociedades no se publican, para que ninguna cifra identifique a una sociedad. Pruebe con una división o una sección más amplia.</p>
        <p className="mt-4"><Link className="underline underline-offset-4" href="/sector">Ver todos los sectores</Link></p>
      </div>
    );

  const { cat } = base.datos;
  const res = d.resumen;
  const ult = res[res.length - 1];
  const def = cat.indicadores.find((x) => x.id === indicador) ?? cat.indicadores[0];
  const filas = d.cuantiles.filter((q) => q.indicador === def.id);
  const nombre = ult.nombre;
  const alerta = d.alerta;
  const serieAlerta: SerieLinea[] = [
    { nombre: nivel === "ciiu4" ? "Su división" : "Este sector", color: "acento", puntos: alerta.map((a) => ({ anio: a.anio, valor: a.pct_perfil_alto })) },
    { nombre: "Todas las sociedades", color: "tinta", puntos: d.alertaNacional.map((a) => ({ anio: a.anio, valor: a.pct_perfil_alto })) },
    { nombre: "Tasa observada de admisión (24 meses)", color: "senal", puntos: alerta.map((a) => ({ anio: a.anio, valor: a.tasa_observada })) },
  ];
  const aniosAlerta = d.alertaNacional.map((a) => a.anio);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <header className="pt-10 sm:pt-12">
        <p className="eyebrow">{tituloNivel[nivel]} · {codigo}</p>
        <h1 className="display mt-2 break-words text-3xl font-semibold leading-tight sm:text-5xl">{nombre}</h1>
        <p className="mt-3 text-ink2"><Link className="underline underline-offset-4" href="/sector">Todos los sectores</Link></p>
      </header>

      <section aria-label={`Cifras de ${ult.anio}`} className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi etiqueta={`Sociedades ${ult.anio}`} valor={entero(ult.n_empresas)} nota="Las que presentaron estados ese año (sin los informes con probable error de unidades)." />
        <Kpi etiqueta={`Ingresos ${ult.anio}`} valor={pesos(ult.ingresos_total_real)} nota={`Suma en pesos de ${cat.pesos_constantes.anio_base}.`} />
        <Kpi
          etiqueta="Crecimiento real"
          valor={ult.crecimiento_real_panel !== null ? porcentaje(ult.crecimiento_real_panel) : "–"}
          nota="De los ingresos de las mismas sociedades frente al año anterior, descontada la inflación (IPC)."
        />
        <Kpi etiqueta="Con pérdida neta" valor={ult.pct_perdida_neta !== null ? porcentaje(ult.pct_perdida_neta) : "–"} nota="De las sociedades que reportaron ganancia o pérdida." />
        <Kpi etiqueta="Con patrimonio negativo" valor={ult.pct_patrimonio_negativo !== null ? porcentaje(ult.pct_patrimonio_negativo) : "–"} />
        <Kpi etiqueta="Crecen y son rentables" valor={ult.pct_crece_rentable !== null ? porcentaje(ult.pct_crece_rentable) : "–"} nota="Ingresos reales al alza y ganancia operacional positiva." />
      </section>

      <Seccion id="distribucion" numero="01 · Distribución" titulo="Cómo se reparte un indicador en el sector">
        <div>
          <label htmlFor="ind" className="eyebrow block">Indicador</label>
          <select id="ind" value={def.id} onChange={(e) => setIndicador(e.target.value)} className="mt-1 min-h-11 max-w-full border border-ink bg-paper px-3 text-ink">
            {cat.indicadores.map((x) => (
              <option key={x.id} value={x.id}>{x.nombre}</option>
            ))}
          </select>
          <p className="mt-2 max-w-3xl text-sm text-ink2">{def.formula}. {def.nota}</p>
        </div>
        <div className="mt-4 max-w-3xl">
          {filas.length ? <BandaSector filas={filas} anios={filas.map((f) => f.anio)} unidad={def.unidad} nombre={def.nombre} /> : <p role="status" className="text-ink2">Este indicador no tiene al menos 15 sociedades con dato en este sector.</p>}
        </div>
      </Seccion>

      <Seccion id="alerta" numero="02 · Perfil de riesgo agregado" titulo="¿Qué proporción de las sociedades muestra un perfil de riesgo alto?">
        <p className="max-w-3xl text-sm text-ink2">
          Un modelo estadístico ordena a las sociedades según si sus cifras se parecen a las de las que después entraron a un proceso de insolvencia. Aquí solo se publica la <strong>proporción de sociedades con un perfil alto</strong> (probabilidad por encima de un umbral fijo: el 5 % de mayor riesgo de 2020–2021), nunca el resultado de una sociedad.
          No es una probabilidad de quiebra ni una calificación: de las sociedades marcadas, la mayoría no entra a un proceso.
          {nivel === "ciiu4" ? ` Para las clases CIIU se muestra la de su división (${d.nombreAlerta ?? codigo.slice(0, 2)}).` : ""}
        </p>
        {alerta.length ? (
          <>
            <div className="mt-4 max-w-3xl">
              <Serie titulo="Proporción con perfil alto y tasa observada de admisión" anios={aniosAlerta} series={serieAlerta} formato="fraccion" nota="La tasa observada solo existe donde ya pasaron 24 meses (cierres hasta 2023)." />
            </div>
            <ul className="mt-3 max-w-3xl list-disc pl-5 text-xs text-ink2">
              {(["entrenamiento", "validacion", "prueba", "sin_etiqueta"] as const).map((m) => {
                const as = alerta.filter((a) => a.muestra === m).map((a) => a.anio);
                return as.length ? <li key={m}>{as[0]}{as.length > 1 ? `–${as[as.length - 1]}` : ""}: {MUESTRA_TEXTO[m]}. {m === "entrenamiento" || m === "validacion" ? "Se usaron para ajustar el modelo: no miden su desempeño." : ""}</li> : null;
              })}
              <li>Modelo LightGBM calibrado con 2020–2021. Detalles y límites en la <Link className="underline underline-offset-4" href="/metodologia#modelo">metodología</Link>.</li>
            </ul>
          </>
        ) : (
          <p role="status" className="mt-4 text-ink2">Este grupo tiene menos de 30 sociedades en la mayoría de los años: no se publican cifras de perfil de riesgo agregado.</p>
        )}
      </Seccion>

      {d.hijos.length > 0 && (
        <Seccion id="subsectores" numero="03 · Dentro del sector" titulo={nivel === "seccion" ? "Sus divisiones" : "Sus clases"}>
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <caption className="sr-only">Subsectores de {nombre} en {ult.anio}</caption>
              <thead>
                <tr className="border-b-2 border-ink">
                  <th scope="col" className="py-2 pr-3 font-medium">Sector</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Sociedades</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Ingresos</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Crecimiento real</th>
                  <th scope="col" className="py-2 text-right font-medium">Con pérdida</th>
                </tr>
              </thead>
              <tbody>
                {d.hijos.map((h) => (
                  <tr key={h.codigo} className="border-b border-rule">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <Link className="underline underline-offset-4" href={`/sector/${h.codigo}`}>{h.codigo} · {h.nombre}</Link>
                    </th>
                    <td className="mono py-2 pr-3 text-right">{entero(h.n_empresas)}</td>
                    <td className="mono py-2 pr-3 text-right">{pesos(h.ingresos_total_real)}</td>
                    <td className="mono py-2 pr-3 text-right">{h.crecimiento_real_panel !== null ? porcentaje(h.crecimiento_real_panel) : "–"}</td>
                    <td className="mono py-2 text-right">{h.pct_perdida_neta !== null ? porcentaje(h.pct_perdida_neta) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      <Aviso />
      <Comunidad />
    </div>
  );
}
