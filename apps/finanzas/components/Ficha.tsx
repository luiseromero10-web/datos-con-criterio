"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { track } from "@dcc/comunidad";
import Arana from "./Arana";
import Aviso from "./Aviso";
import Comunidad from "./Comunidad";
import Perezoso from "./Perezoso";
import Serie, { type SerieLinea } from "./Serie";
import { medianasSector, type MedianaSector } from "@/lib/consultas";
import { entero, nit as formatoNit, nombrePropio, pesos, valorIndicador } from "@/lib/format";
import { ejesDe } from "@/lib/perfil";
import { lecturaPercentil } from "@/lib/texto";
import type { AnioEmpresa, Catalogos, Ficha as FichaDatos } from "@/lib/tipos";
import { useBase, useFicha } from "@/lib/usar";

const NIIF = { G1: "NIIF plenas (Grupo 1)", G2: "NIIF para pymes (Grupo 2)" } as const;

function Cargando({ texto }: { texto: string }) {
  return (
    <div role="status" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p className="text-ink2">{texto}</p>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{etiqueta}</dt>
      <dd className="mt-0.5 break-words">{valor}</dd>
    </div>
  );
}

function Encabezado({ f, a }: { f: FichaDatos; a: AnioEmpresa }) {
  const edad = a.fecha_constitucion ? a.anio - Number(a.fecha_constitucion.slice(0, 4)) : null;
  const primero = f.anios[0].anio;
  const ultimo = f.anios[f.anios.length - 1].anio;
  return (
    <header className="pt-10 sm:pt-12">
      <p className="eyebrow">Ficha de sociedad · NIT {formatoNit(f.empresa.nit)}</p>
      <h1 className="display mt-2 break-words text-3xl font-semibold leading-tight sm:text-5xl">{nombrePropio(a.razon_social)}</h1>
      <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Dato
          etiqueta="Actividad principal (CIIU)"
          valor={
            a.ciiu_codigo ? (
              <>
                <Link className="underline underline-offset-4" href={`/sector/${a.ciiu_codigo}`}>
                  {a.ciiu_codigo} · {a.ciiu_descripcion ?? "sector"}
                </Link>
                {a.ciiu_origen && a.ciiu_origen !== "propio" && <span className="block text-xs text-ink2">Tomada del año {a.ciiu_origen.replace("heredado_", "")}: la carátula de ese año no la trae.</span>}
              </>
            ) : (
              "Sin dato"
            )
          }
        />
        <Dato etiqueta="Domicilio" valor={[a.municipio, a.departamento].filter(Boolean).join(", ") || "Sin dato"} />
        <Dato etiqueta="Tipo societario" valor={a.tipo_societario ?? "Sin dato"} />
        <Dato etiqueta="Constitución" valor={a.fecha_constitucion ? `${a.fecha_constitucion.slice(0, 4)}${edad !== null ? ` (${edad} años al cierre)` : ""}` : "Sin dato"} />
        <Dato etiqueta="Estados financieros" valor={`${NIIF[a.grupo]} · ${a.tipo_estado === "separado" ? "estado separado" : "estado individual"}`} />
        <Dato etiqueta="Años reportados" valor={`${f.anios.length} (${primero}–${ultimo})`} />
        <Dato etiqueta="Estado en la carátula" valor={a.estado_actual ?? "Sin dato"} />
        <Dato etiqueta="Opinión del revisor fiscal" valor={a.opinion_revisor ?? "Sin dato o no obligada"} />
      </dl>
      {a.tipo_estado === "separado" && (
        <p className="mt-4 max-w-3xl border-l-4 border-forecast bg-paper2 p-3 text-sm">
          Este año la sociedad solo presentó <strong>estado separado</strong> (no individual): suele ser una controlante o filial de un grupo, y sus cifras no incluyen las de sus subsidiarias. Se compara con otras sociedades de su sector, que en su mayoría presentan estado individual.
        </p>
      )}
      {a.atipico_unidades && (
        <p className="mt-4 max-w-3xl border-l-4 border-senal bg-paper2 p-3 text-sm" role="note">
          Los valores de este informe son unas mil veces distintos de los demás años de la sociedad: probablemente se presentó en otras unidades. Se muestran tal como se reportaron, pero no entran en las cifras agregadas por sector ni en el crecimiento.
        </p>
      )}
    </header>
  );
}

function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="panel p-4">
      <p className="eyebrow">{etiqueta}</p>
      <p className="cifra mt-2 break-words">{valor}</p>
      {nota && <p className="mt-2 text-xs text-ink2">{nota}</p>}
    </div>
  );
}

function CifrasClave({ a, cat }: { a: AnioEmpresa; cat: Catalogos }) {
  const g = a.ind.crecimiento_real_ingresos;
  return (
    <section aria-label={`Cifras clave de ${a.anio}`} className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Cifra
        etiqueta={`Ingresos ${a.anio}`}
        valor={pesos(a.estados.ingresos)}
        nota={g !== null && g !== undefined ? `${g >= 0 ? "Crecieron" : "Cayeron"} ${valorIndicador("fraccion", Math.abs(g))} en pesos constantes frente al año anterior.` : a.motivo.crecimiento_real_ingresos ? cat.motivos[a.motivo.crecimiento_real_ingresos] : undefined}
      />
      <Cifra etiqueta="Ganancia neta" valor={pesos(a.estados.ganancia_neta)} nota={a.ind.margen_neto !== null ? `Margen neto de ${valorIndicador("fraccion", a.ind.margen_neto)}.` : undefined} />
      <Cifra etiqueta="Activo total" valor={pesos(a.estados.activo_total)} nota={a.ind.roa !== null ? `ROA de ${valorIndicador("fraccion", a.ind.roa)}.` : undefined} />
      <Cifra etiqueta="Patrimonio" valor={pesos(a.estados.patrimonio)} nota={a.ind.endeudamiento !== null ? `Endeudamiento de ${valorIndicador("fraccion", a.ind.endeudamiento)} del activo.` : undefined} />
    </section>
  );
}

function Pares({ a, cat }: { a: AnioEmpresa; cat: Catalogos }) {
  const { nivel, n, tercil, codigo } = a.par;
  if (nivel === "ninguno" || !n) {
    return (
      <p className="text-sm text-ink2">
        No hay suficientes sociedades comparables (se necesitan al menos {cat.pares.minimo_para_percentil}): este año no se calculan percentiles. Los valores sí se muestran.
      </p>
    );
  }
  const terc = tercil ? ["menores", "medios", "mayores"][tercil - 1] : null;
  return (
    <p className="text-sm text-ink2">
      Se compara con <strong>{entero(n)} sociedades</strong> del mismo año. Grupo de pares: {cat.pares.niveles[nivel]?.toLowerCase() ?? "su sector"}
      {codigo ? ` (código ${codigo})` : ""}{terc ? `; dentro del sector, las de ingresos ${terc}` : ""}. El percentil dice a cuántas de ellas supera la sociedad (100 = mejor que casi todas; en endeudamiento y días de cartera se invierte: menos es mejor).
    </p>
  );
}

function TablaIndicadores({ a, cat, medianas }: { a: AnioEmpresa; cat: Catalogos; medianas: Map<string, MedianaSector> }) {
  return (
    <div tabIndex={0} className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Indicadores de {a.anio}: valor, mediana del sector y percentil frente a los pares</caption>
        <thead>
          <tr className="border-b-2 border-ink">
            <th scope="col" className="py-2 pr-3 font-medium">Indicador</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Valor</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Mediana del sector</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Percentil</th>
            <th scope="col" className="py-2 font-medium">Lectura</th>
          </tr>
        </thead>
        <tbody>
          {cat.indicadores.map((d) => {
            const v = a.ind[d.id];
            const m = medianas.get(d.id);
            const p = a.pct[d.id];
            return (
              <tr key={d.id} className="border-b border-rule align-top">
                <th scope="row" className="py-2 pr-3 font-normal">
                  <span className="font-medium">{d.nombre}</span>
                  <span className="block text-xs text-ink2">{d.formula}</span>
                  {d.nota && <span className="block text-xs text-ink2">{d.nota}</span>}
                </th>
                <td className="mono py-2 pr-3 text-right">{v !== null && v !== undefined ? valorIndicador(d.unidad, v) : "–"}</td>
                <td className="mono py-2 pr-3 text-right">{m ? valorIndicador(d.unidad, m.p50) : "–"}</td>
                <td className="mono py-2 pr-3 text-right">{p !== null && p !== undefined ? Math.round(p) : "–"}</td>
                <td className="py-2 text-xs text-ink2">
                  {v === null || v === undefined ? (a.motivo[d.id] ? cat.motivos[a.motivo[d.id] as string] : "Sin dato") : lecturaPercentil(p, d.sentido)}
                  {d.sentido === -1 && v !== null && v !== undefined && p !== null && p !== undefined ? " (menos es mejor)" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Senales({ a, cat }: { a: AnioEmpresa; cat: Catalogos }) {
  const sin = cat.senales.filter((s) => a.senales[s.id] === null || a.senales[s.id] === undefined).length;
  return (
    <div>
      <p className="max-w-3xl text-sm text-ink2">
        Son hechos reportados por la sociedad, redactados sin interpretarlos: no se suman en un puntaje y no son una calificación de riesgo.
        {sin > 0 ? ` ${sin} ${sin === 1 ? "no se pudo evaluar" : "no se pudieron evaluar"} por falta de datos.` : ""}
      </p>
      <div tabIndex={0} className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <caption className="sr-only">Señales de {a.anio}</caption>
          <thead>
            <tr className="border-b-2 border-ink">
              <th scope="col" className="py-2 pr-3 font-medium">Señal</th>
              <th scope="col" className="py-2 font-medium">¿Se presenta?</th>
            </tr>
          </thead>
          <tbody>
            {cat.senales.map((s) => {
              const v = a.senales[s.id];
              return (
                <tr key={s.id} className="border-b border-rule">
                  <th scope="row" className="py-2 pr-3 font-normal">{s.texto}</th>
                  <td className="py-2">
                    {v === true ? <span className="mono border border-dashed border-senal px-1.5 py-0.5 text-senal">Sí</span> : v === false ? <span className="mono text-ink2">No</span> : <span className="mono text-ink2">Sin dato</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

export default function Ficha({ nit }: { nit: string }) {
  const base = useBase();
  const carga = useFicha(nit);
  const [anioSel, setAnioSel] = useState<number | null>(null);
  const [medianas, setMedianas] = useState<{ clave: string; v: Map<string, MedianaSector> } | null>(null);
  const [real, setReal] = useState(false);
  const f = carga.estado === "listo" ? carga.datos : null;

  useEffect(() => {
    if (f) {
      track("ver_empresa");
      document.title = `${nombrePropio(f.anios[f.anios.length - 1].razon_social)} · Radiografía financiera · Datos con Criterio`;
    }
  }, [f]);

  const a = f ? (f.anios.find((x) => x.anio === anioSel) ?? f.anios[f.anios.length - 1]) : null;
  const clave = a ? `${a.ciiu_codigo}|${a.anio}` : "";
  useEffect(() => {
    if (!a) return;
    let vivo = true;
    medianasSector(a.ciiu_codigo, a.anio)
      .then((v) => vivo && setMedianas({ clave: `${a.ciiu_codigo}|${a.anio}`, v }))
      .catch(() => vivo && setMedianas({ clave: `${a.ciiu_codigo}|${a.anio}`, v: new Map() }));
    return () => {
      vivo = false;
    };
  }, [a]);

  const cat = base.estado === "listo" ? base.datos.cat : null;
  const series = useMemo(() => {
    if (!f) return null;
    const anios = f.anios.map((x) => x.anio);
    const sr = (nombre: string, fn: (x: AnioEmpresa) => number | null | undefined, color?: SerieLinea["color"]): SerieLinea => ({ nombre, color, puntos: f.anios.map((x) => ({ anio: x.anio, valor: fn(x) ?? null })) });
    return {
      anios,
      ingresos: [sr("Ingresos", (x) => (real ? x.reales.ingresos_real : x.estados.ingresos), "acento"), sr("Ganancia neta", (x) => (real ? x.reales.ganancia_neta_real : x.estados.ganancia_neta), "senal")],
      margenes: [sr("Margen bruto", (x) => x.ind.margen_bruto, "cerulea"), sr("Margen operacional", (x) => x.ind.margen_operacional, "acento"), sr("Margen neto", (x) => x.ind.margen_neto, "senal")],
      rentabilidad: [sr("ROA", (x) => x.ind.roa, "acento"), sr("ROE", (x) => x.ind.roe, "senal")],
      razon: [sr("Razón corriente", (x) => x.ind.razon_corriente, "acento"), sr("Prueba ácida", (x) => x.ind.prueba_acida, "cerulea")],
      deuda: [sr("Endeudamiento", (x) => x.ind.endeudamiento, "acento")],
      ciclo: [sr("Cartera", (x) => x.ind.dias_cartera, "acento"), sr("Inventario", (x) => x.ind.dias_inventario, "cerulea"), sr("Proveedores", (x) => x.ind.dias_proveedores, "senal")],
    };
  }, [f, real]);

  if (carga.estado === "cargando" || base.estado === "cargando") return <Cargando texto="Cargando la ficha de la sociedad… (la primera vez tarda unos segundos mientras se prepara el motor de consultas)" />;
  if (carga.estado === "error" || base.estado === "error")
    return <Cargando texto={`No se pudo cargar la ficha. ${carga.estado === "error" ? carga.mensaje : base.estado === "error" ? base.mensaje : ""} Recargue la página.`} />;
  if (!f || !a || !cat || !series)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="display text-3xl">No encontramos esa sociedad</h1>
        <p className="mt-3 text-ink2">
          No hay estados financieros con ese NIT entre las sociedades que reportan a la Supersociedades (2016–2025). Los bancos, aseguradoras, cooperativas y microempresas no están en esta fuente.
        </p>
        <p className="mt-4"><Link className="underline underline-offset-4" href="/">Volver al buscador</Link></p>
      </div>
    );

  const m = medianas && medianas.clave === clave ? medianas.v : new Map<string, MedianaSector>();
  const ejes = ejesDe(a, cat);
  const sinEje = cat.indicadores.filter((d) => ["margen_operacional", "margen_neto", "roa", "razon_corriente", "endeudamiento", "cobertura_intereses", "dias_cartera", "crecimiento_real_ingresos"].includes(d.id) && (a.pct[d.id] === null || a.pct[d.id] === undefined));
  const nombre = nombrePropio(a.razon_social);
  const ref = m.size ? [...m.values()][0] : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <Encabezado f={f} a={a} />

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="anio" className="eyebrow block">Año de cierre</label>
          <select id="anio" value={a.anio} onChange={(e) => setAnioSel(Number(e.target.value))} className="mt-1 min-h-11 border border-ink bg-paper px-3 text-ink">
            {[...f.anios].reverse().map((x) => (
              <option key={x.anio} value={x.anio}>{x.anio}</option>
            ))}
          </select>
        </div>
        <p className="pb-2 text-sm text-ink2">Cifras en pesos corrientes de cada año, salvo donde se indique «pesos constantes».</p>
        <p className="pb-2 text-sm"><Link className="underline underline-offset-4" href={`/comparar?a=${f.empresa.nit}`} onClick={() => track("comparar_empresas")}>Comparar con otra sociedad</Link></p>
      </div>

      <CifrasClave a={a} cat={cat} />

      <Seccion id="pares" numero="01 · Frente a sus pares" titulo={`¿Cómo está ${nombre} frente a sociedades parecidas?`}>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <Pares a={a} cat={cat} />
            {ejes.length < 3 && <p className="mt-3 text-sm" role="status">No hay suficientes indicadores con percentil este año para dibujar la araña.</p>}
            {sinEje.length > 0 && ejes.length >= 3 && <p className="mt-3 text-xs text-ink2">Sin percentil este año: {sinEje.map((d) => d.nombre.toLowerCase()).join(", ")}.</p>}
            <ul className="mt-4 space-y-1 text-sm">
              {ejes.map((e) => (
                <li key={e.id}><span className="font-medium">{e.nombre}:</span> {e.real} · percentil {Math.round(e.valor)}</li>
              ))}
            </ul>
          </div>
          <div>
            <Arana series={[{ nombre, ejes, color: "acento" }]} ids={ejes.map((e) => ({ id: e.id, nombre: e.nombre }))} etiqueta={`Araña de ${nombre} en ${a.anio}: ${ejes.map((e) => `${e.nombre} percentil ${Math.round(e.valor)}`).join(", ")}`} />
            <p className="text-xs text-ink2">Línea punteada: la mediana de sus pares (percentil 50).</p>
          </div>
        </div>
      </Seccion>

      <Seccion id="serie" numero="02 · Diez años" titulo="Su recorrido año a año">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span id="mon" className="eyebrow">Ingresos y ganancia en</span>
          <div role="group" aria-labelledby="mon" className="inline-flex">
            <button type="button" aria-pressed={!real} onClick={() => setReal(false)} className={`min-h-11 border border-ink px-3 ${!real ? "bg-ink text-paper" : ""}`}>Pesos corrientes</button>
            <button type="button" aria-pressed={real} onClick={() => setReal(true)} className={`min-h-11 border border-l-0 border-ink px-3 ${real ? "bg-ink text-paper" : ""}`}>Pesos de {cat.pesos_constantes.anio_base}</button>
          </div>
        </div>
        <Perezoso alto="h-64">
          <div className="grid gap-x-8 gap-y-8 md:grid-cols-2">
            <Serie titulo={real ? `Ingresos y ganancia neta (pesos de ${cat.pesos_constantes.anio_base})` : "Ingresos y ganancia neta (pesos corrientes)"} anios={series.anios} series={series.ingresos} formato="pesos" barras />
            <Serie titulo="Márgenes" anios={series.anios} series={series.margenes} formato="fraccion" nota="Los valores fuera de ±300 % se dibujan en el borde; la tabla y el texto emergente muestran el real." />
            <Serie titulo="Rentabilidad: ROA y ROE" anios={series.anios} series={series.rentabilidad} formato="fraccion" />
            <Serie titulo="Liquidez: razón corriente y prueba ácida (veces)" anios={series.anios} series={series.razon} formato="veces" />
            <Serie titulo="Endeudamiento (pasivo / activo)" anios={series.anios} series={series.deuda} formato="fraccion" />
            <Serie titulo="Ciclo de caja: días de cartera, inventario y proveedores" anios={series.anios} series={series.ciclo} formato="dias" />
          </div>
        </Perezoso>
      </Seccion>

      <Seccion id="indicadores" numero={`03 · Indicadores de ${a.anio}`} titulo="Todos los indicadores, con su sector">
        <p className="mb-3 max-w-3xl text-sm text-ink2">
          La mediana del sector es la de {ref ? `la ${ref.nivel === "ciiu4" ? "clase" : "división"} CIIU ${ref.codigo}` : "su clase o división CIIU (si tiene al menos 15 sociedades)"}. El percentil es frente a sus pares (sector y tamaño), no frente a todo el sector.
        </p>
        <TablaIndicadores a={a} cat={cat} medianas={m} />
      </Seccion>

      <Seccion id="senales" numero={`04 · Señales de ${a.anio}`} titulo="Hechos que conviene mirar">
        <Senales a={a} cat={cat} />
      </Seccion>

      <Aviso />
      <Comunidad />
    </div>
  );
}
