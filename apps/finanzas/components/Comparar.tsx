"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { track } from "@dcc/comunidad";
import Arana from "./Arana";
import Aviso from "./Aviso";
import Buscador from "./Buscador";
import Comunidad from "./Comunidad";
import { nitSeguro, type Resultado } from "@/lib/consultas";
import { nit as formatoNit, nombrePropio, pesos, valorIndicador } from "@/lib/format";
import { ejesComunes, ejesDe } from "@/lib/perfil";
import { fraseComparacion } from "@/lib/texto";
import type { AnioEmpresa, Catalogos, Ficha } from "@/lib/tipos";
import { useBase, useFicha } from "@/lib/usar";

function Lado({ etiqueta, nit, onElegir, onQuitar }: { etiqueta: string; nit: string | null; onElegir: (r: Resultado) => void; onQuitar: () => void }) {
  const carga = useFicha(nit);
  const f = carga.estado === "listo" ? carga.datos : null;
  const ult = f?.anios[f.anios.length - 1];
  return (
    <div className="panel p-4">
      <p className="eyebrow">{etiqueta}</p>
      {nit && carga.estado === "cargando" && <p role="status" className="mt-2 text-ink2">Cargando…</p>}
      {nit && carga.estado === "error" && <p role="alert" className="mt-2 text-senal">No se pudo cargar la sociedad.</p>}
      {nit && f === null && carga.estado === "listo" && <p className="mt-2 text-ink2">No hay estados financieros con el NIT {nit}.</p>}
      {f && ult ? (
        <div className="mt-2">
          <p className="display text-xl leading-tight">{nombrePropio(ult.razon_social)}</p>
          <p className="mono text-sm text-ink2">NIT {formatoNit(f.empresa.nit)} · {ult.ciiu_descripcion ?? "actividad sin dato"}</p>
          <p className="mt-2 flex gap-4 text-sm">
            <Link className="underline underline-offset-4" href={`/empresa/${f.empresa.nit}`}>Ver su ficha</Link>
            <button type="button" onClick={onQuitar} className="min-h-11 underline underline-offset-4">Cambiar</button>
          </p>
        </div>
      ) : (
        !nit && <div className="mt-2"><Buscador alElegir={onElegir} etiqueta={`Buscar la ${etiqueta.toLowerCase()}`} /></div>
      )}
    </div>
  );
}

function aniosComunes(a: Ficha, b: Ficha): number[] {
  const ys = new Set(b.anios.map((x) => x.anio));
  return a.anios.map((x) => x.anio).filter((x) => ys.has(x));
}

function Tabla({ x, y, na, nb, cat }: { x: AnioEmpresa; y: AnioEmpresa; na: string; nb: string; cat: Catalogos }) {
  const filas = [
    { etiqueta: "Ingresos", a: pesos(x.estados.ingresos), b: pesos(y.estados.ingresos) },
    { etiqueta: "Ganancia neta", a: pesos(x.estados.ganancia_neta), b: pesos(y.estados.ganancia_neta) },
    { etiqueta: "Activo total", a: pesos(x.estados.activo_total), b: pesos(y.estados.activo_total) },
    { etiqueta: "Patrimonio", a: pesos(x.estados.patrimonio), b: pesos(y.estados.patrimonio) },
  ];
  return (
    <div tabIndex={0} className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <caption className="sr-only">Comparación de {na} y {nb} en {x.anio}</caption>
        <thead>
          <tr className="border-b-2 border-ink">
            <th scope="col" className="py-2 pr-3 font-medium">Cifra o indicador</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">{na}</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">{nb}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.etiqueta} className="border-b border-rule">
              <th scope="row" className="py-2 pr-3 font-normal">{f.etiqueta}</th>
              <td className="mono py-2 pr-3 text-right">{f.a}</td>
              <td className="mono py-2 pr-3 text-right">{f.b}</td>
            </tr>
          ))}
          {cat.indicadores.map((d) => {
            const vx = x.ind[d.id], vy = y.ind[d.id];
            const px = x.pct[d.id], py = y.pct[d.id];
            const mejor = d.sentido !== 0 && vx !== null && vy !== null && vx !== vy ? ((d.sentido > 0 ? vx > vy : vx < vy) ? "x" : "y") : null;
            const cel = (v: number | null, p: number | null, es: boolean) => (
              <td className={`mono py-2 pr-3 text-right ${es ? "font-semibold" : ""}`}>
                {valorIndicador(d.unidad, v)}
                {p !== null && p !== undefined && <span className="block text-xs font-normal text-ink2">percentil {Math.round(p)}</span>}
              </td>
            );
            return (
              <tr key={d.id} className="border-b border-rule align-top">
                <th scope="row" className="py-2 pr-3 font-normal">{d.nombre}{d.sentido === -1 && <span className="block text-xs text-ink2">menos es mejor</span>}</th>
                {cel(vx, px, mejor === "x")}
                {cel(vy, py, mejor === "y")}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Comparar() {
  const sp = useSearchParams();
  const router = useRouter();
  const base = useBase();
  const nitA = nitSeguro(sp.get("a") ?? "")?.toString() ?? null;
  const nitB = nitSeguro(sp.get("b") ?? "")?.toString() ?? null;
  const ca = useFicha(nitA);
  const cb = useFicha(nitB);
  const fa = ca.estado === "listo" ? ca.datos : null;
  const fb = cb.estado === "listo" ? cb.datos : null;
  const [anioSel, setAnioSel] = useState<number | null>(null);
  const [copiado, setCopiado] = useState<"" | "ok" | "no">("");

  const poner = (k: "a" | "b", nit: number | null) => {
    const p = new URLSearchParams(sp.toString());
    if (nit === null) p.delete(k);
    else p.set(k, String(nit));
    router.replace(p.toString() ? `/comparar?${p}` : "/comparar", { scroll: false });
  };

  const comunes = useMemo(() => (fa && fb ? aniosComunes(fa, fb) : []), [fa, fb]);
  const anio = anioSel && comunes.includes(anioSel) ? anioSel : (comunes[comunes.length - 1] ?? null);
  const cat = base.estado === "listo" ? base.datos.cat : null;
  const x = fa?.anios.find((v) => v.anio === anio);
  const y = fb?.anios.find((v) => v.anio === anio);
  const listo = Boolean(fa && fb && cat && x && y && nitA !== nitB);

  useEffect(() => {
    if (listo) track("comparar_empresas");
  }, [listo]);

  const na = x ? nombrePropio(x.razon_social) : "";
  const nb = y ? nombrePropio(y.razon_social) : "";
  const ea = ejesDe(x, cat ?? ({ indicadores: [] } as unknown as Catalogos));
  const eb = ejesDe(y, cat ?? ({ indicadores: [] } as unknown as Catalogos));
  const ids = ejesComunes(ea, eb).map((id) => ({ id, nombre: ea.find((e) => e.id === id)!.nombre }));
  const frases = listo && cat ? fraseComparacion({ nombre: na, a: x! }, { nombre: nb, a: y! }, cat.indicadores) : [];

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado("ok");
    } catch {
      setCopiado("no");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-12">
      <p className="eyebrow">Comparar</p>
      <h1 className="display mt-2 text-3xl font-semibold sm:text-5xl">Dos sociedades, lado a lado</h1>
      <p className="mt-3 max-w-3xl text-ink2">Elija dos sociedades. Verá sus indicadores del mismo año, una araña con las dos y una lectura en palabras. El enlace de la página queda con la comparación para compartirla.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Lado etiqueta="Primera sociedad" nit={nitA} onElegir={(r) => poner("a", r.nit)} onQuitar={() => poner("a", null)} />
        <Lado etiqueta="Segunda sociedad" nit={nitB} onElegir={(r) => poner("b", r.nit)} onQuitar={() => poner("b", null)} />
      </div>

      {nitA && nitB && nitA === nitB && <p role="alert" className="mt-6">Eligió la misma sociedad dos veces: cambie una de las dos.</p>}
      {fa && fb && comunes.length === 0 && <p role="alert" className="mt-6">Las dos sociedades no tienen ningún año de cierre en común.</p>}

      {listo && cat && x && y && anio && (
        <>
          <div className="mt-8 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="anio-c" className="eyebrow block">Año de cierre</label>
              <select id="anio-c" value={anio} onChange={(e) => setAnioSel(Number(e.target.value))} className="mt-1 min-h-11 border border-ink bg-paper px-3 text-ink">
                {[...comunes].reverse().map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={copiar} className="min-h-11 border border-ink px-4 hover:bg-paper2">Copiar el enlace de esta comparación</button>
            <p role="status" className="pb-2 text-sm text-ink2">{copiado === "ok" ? "Enlace copiado." : copiado === "no" ? "No se pudo copiar: copie la dirección del navegador." : ""}</p>
          </div>

          <section aria-labelledby="lectura" className="mt-10">
            <p className="eyebrow">01 · En palabras</p>
            <h2 id="lectura" className="display mt-1 text-2xl sm:text-3xl">¿Quién está mejor y en qué?</h2>
            <ul className="mt-4 max-w-3xl space-y-2">
              {frases.map((t, i) => (
                <li key={i} className={i === 0 ? "font-semibold" : ""}>{t}</li>
              ))}
            </ul>
            <p className="mt-3 max-w-3xl text-sm text-ink2">
              «Mejor» sigue el sentido de cada indicador (menos endeudamiento es mejor). Los percentiles de cada sociedad son frente a <strong>sus propios pares</strong>: si están en sectores distintos, compare los valores y no los percentiles.
              {x.tipo_estado !== y.tipo_estado ? " Una presenta estado individual y la otra separado: sus cifras no son del todo comparables." : ""}
            </p>
          </section>

          <section aria-labelledby="arana" className="mt-10">
            <p className="eyebrow">02 · Araña</p>
            <h2 id="arana" className="display mt-1 text-2xl sm:text-3xl">Percentil frente a sus pares</h2>
            <div className="mt-2 max-w-2xl">
              {ids.length >= 3 ? (
                <Arana
                  series={[{ nombre: na, ejes: ea, color: "acento" }, { nombre: nb, ejes: eb, color: "senal" }]}
                  ids={ids}
                  etiqueta={`Araña de ${na} y ${nb} en ${anio}: ${ids.map((i) => `${i.nombre}: ${Math.round(ea.find((e) => e.id === i.id)!.valor)} y ${Math.round(eb.find((e) => e.id === i.id)!.valor)}`).join("; ")}`}
                />
              ) : (
                <p role="status" className="text-ink2">No hay suficientes indicadores con percentil en las dos sociedades para dibujar la araña; la tabla sí muestra sus valores.</p>
              )}
              <ul className="mt-2 flex flex-wrap gap-x-6 text-sm" aria-label="Leyenda">
                <li><span aria-hidden="true" className="mr-2 inline-block h-3 w-3 bg-accent" />{na}</li>
                <li><span aria-hidden="true" className="mr-2 inline-block h-3 w-3" style={{ background: "var(--senal-viva)" }} />{nb}</li>
                <li className="text-ink2">Línea punteada: mediana de pares (50)</li>
              </ul>
            </div>
          </section>

          <section aria-labelledby="tabla" className="mt-10">
            <p className="eyebrow">03 · Tabla</p>
            <h2 id="tabla" className="display mt-1 text-2xl sm:text-3xl">Cifras e indicadores de {anio}</h2>
            <div className="mt-4"><Tabla x={x} y={y} na={na} nb={nb} cat={cat} /></div>
            <p className="mt-2 text-xs text-ink2">En negrilla, el valor mejor de cada indicador con sentido definido.</p>
          </section>
        </>
      )}

      <Aviso />
      <Comunidad />
    </div>
  );
}
