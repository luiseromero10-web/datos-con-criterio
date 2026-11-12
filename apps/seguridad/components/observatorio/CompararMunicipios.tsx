"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { RadarChart } from "echarts/charts";
import { LegendComponent, RadarComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { cssVar, useTema } from "@/lib/useTema";
import { COLOR_A, COLOR_B } from "@/lib/colores";
import { fraseComparacion, type EjePerfil } from "@/lib/perfil";

echarts.use([RadarChart, RadarComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

type Lado = { nombre: string; departamento: string; ejes: EjePerfil[] };
type Props = { a: Lado; b: Lado; distanciaKm: number | null; onSalir: () => void; onCambiarB: () => void };

const reducirMovimiento = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const dec = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });

/** Tarjeta de comparación: dos arañas superpuestas, la diferencia por tipo de delito y una lectura en palabras. */
export default function CompararMunicipios({ a, b, distanciaKm, onSalir, onCambiarB }: Props) {
  const div = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const tema = useTema();

  useEffect(() => {
    if (!div.current) return;
    const c = echarts.init(div.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(div.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    if (a.ejes.length < 3 || b.ejes.length < 3) {
      c.clear();
      return;
    }
    const ink = cssVar("--ink", "#0b1f3a");
    const rule = cssVar("--rule", "#c9d3e0");
    const papel = cssVar("--paper", "#fff");
    const serie = (l: Lado, color: string) => ({
      name: l.nombre,
      value: l.ejes.map((e) => e.valor),
      lineStyle: { width: 2.5, color },
      itemStyle: { color, borderColor: papel, borderWidth: 1.5 },
      areaStyle: { color, opacity: 0.22 },
    });
    c.setOption({
      animation: !reducirMovimiento(),
      animationDuration: 900,
      animationEasing: "cubicOut",
      animationDurationUpdate: 600,
      tooltip: {
        confine: true,
        formatter: (p: { name?: string }) => {
          const l = p.name === b.nombre ? b : a;
          return `<strong>${l.nombre}</strong><br/>${l.ejes.map((e) => `${e.nombre}: p${e.valor}`).join("<br/>")}`;
        },
      },
      radar: {
        radius: "54%",
        center: ["50%", "54%"],
        startAngle: 90,
        splitNumber: 4,
        indicator: a.ejes.map((e) => ({ name: e.nombre.replace(" ", "\n"), max: 100 })),
        axisName: { color: ink, fontSize: 11, lineHeight: 13 },
        axisLine: { lineStyle: { color: rule } },
        splitLine: { lineStyle: { color: rule } },
        splitArea: { show: false },
      },
      series: [{ type: "radar", symbol: "circle", symbolSize: 6, data: [serie(a, COLOR_A), serie(b, COLOR_B)] }],
    });
  }, [a, b, tema]);

  const listo = a.ejes.length >= 3 && b.ejes.length >= 3;
  const frases = listo ? fraseComparacion(a.nombre, b.nombre, a.ejes, b.ejes) : [];
  return (
    <div
      role="group"
      aria-label={`Comparación de ${a.nombre} y ${b.nombre}`}
      className="panel border border-rule bg-[var(--paper)] p-4 shadow-lg sm:absolute sm:left-3 sm:top-3 sm:z-10 sm:max-h-[calc(100%-1.5rem)] sm:w-[23rem] sm:max-w-[calc(100%-1.5rem)] sm:overflow-y-auto sm:bg-[color-mix(in_srgb,var(--paper)_94%,transparent)] sm:backdrop-blur"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">Comparación</p>
        <button type="button" onClick={onSalir} className="min-h-11 min-w-11 border border-rule text-lg leading-none" aria-label="Salir de la comparación">
          ×
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {([[a, COLOR_A], [b, COLOR_B]] as [Lado, string][]).map(([l, color]) => (
          <div key={l.nombre} className="border-t-4 pt-1" style={{ borderColor: color }}>
            <h3 className="display text-lg leading-tight">{l.nombre}</h3>
            <p className="text-xs text-ink2">{l.departamento}</p>
          </div>
        ))}
      </div>
      {distanciaKm !== null && <p className="mono mt-2 text-xs text-ink2">A {dec(distanciaKm)} km uno del otro (entre centros)</p>}
      <div ref={div} className="mt-1 h-64 w-full" role="img" aria-label={`Araña comparada de ${a.nombre} y ${b.nombre}, un eje por tipo de delito`} />
      {!listo && <p className="text-sm text-ink2" role="status">Calculando el perfil por tipo de delito…</p>}
      <div className="mt-1 space-y-1 text-sm">
        {frases.map((f) => (
          <p key={f}>{f}</p>
        ))}
      </div>
      {listo && (
        <table className="mt-3 w-full text-sm">
          <caption className="eyebrow mb-1 text-left">Tasa por 100 mil, por tipo de delito</caption>
          <thead>
            <tr className="text-xs text-ink2">
              <th scope="col" className="text-left font-normal">Delito</th>
              <th scope="col" className="border-b-4 text-right font-normal text-ink" style={{ borderColor: COLOR_A }}>{a.nombre}</th>
              <th scope="col" className="border-b-4 text-right font-normal text-ink" style={{ borderColor: COLOR_B }}>{b.nombre}</th>
            </tr>
          </thead>
          <tbody className="mono text-xs">
            {a.ejes.map((e, i) => {
              const o = b.ejes[i];
              return (
                <tr key={e.id} className="border-t border-rule">
                  <th scope="row" className="py-1 text-left font-sans text-sm font-normal text-ink2">{e.nombre}</th>
                  <td className={`text-right ${e.tasa > o.tasa ? "font-bold" : ""}`}>{dec(e.tasa)}</td>
                  <td className={`text-right ${o.tasa > e.tasa ? "font-bold" : ""}`}>{dec(o.tasa)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-ink2">La araña muestra el percentil frente a todos los municipios; la tabla, la tasa real. En negrita, la más alta de cada fila.</p>
      <button type="button" onClick={onCambiarB} className="mt-3 min-h-11 w-full border border-ink px-3 font-medium hover:bg-paper2">
        Cambiar el segundo municipio
      </button>
    </div>
  );
}
