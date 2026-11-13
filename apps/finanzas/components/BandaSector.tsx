"use client";
import { useCallback, useId } from "react";
import Grafico from "./Grafico";
import { valorIndicador, type Unidad } from "@/lib/format";
import { cssVar } from "@/lib/useTema";
import type { CuantilesSector } from "@/lib/tipos";

const LIMITE: Record<Unidad, [number, number]> = { fraccion: [-3, 3], veces: [-20, 20], dias: [-500, 1500] };
const acotar = (u: Unidad, v: number) => Math.min(Math.max(v, LIMITE[u][0]), LIMITE[u][1]);

/** Mediana de un indicador en un sector, año a año, con la banda del 50 % central de las sociedades (p25–p75) y las líneas del 5 y 95 %. */
export default function BandaSector({ filas, anios, unidad, nombre }: { filas: CuantilesSector[]; anios: number[]; unidad: Unidad; nombre: string }) {
  const id = useId();
  const opcion = useCallback(() => {
    const por = new Map(filas.map((f) => [f.anio, f]));
    const ink = cssVar("--ink", "#0b1f3a");
    const ink2 = cssVar("--ink-2", "#465a76");
    const rule = cssVar("--rule", "#c8d5e8");
    const acento = cssVar("--accent", "#1f45c4");
    const val = (a: number, k: "p05" | "p25" | "p50" | "p75" | "p95") => {
      const f = por.get(a);
      return f ? acotar(unidad, f[k]) : null;
    };
    return {
      grid: { left: 8, right: 16, top: 34, bottom: 4, containLabel: true },
      legend: { top: 0, textStyle: { color: ink, fontSize: 11 }, data: ["Mediana", "50 % central (p25–p75)", "5 % y 95 %"], icon: "roundRect", itemWidth: 14, itemHeight: 3 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { axisValue: string }[]) => {
          const a = Number(ps[0]?.axisValue);
          const f = por.get(a);
          return f
            ? `<strong>${a}</strong> (${f.n.toLocaleString("es-CO")} sociedades)<br/>Mediana: ${valorIndicador(unidad, f.p50)}<br/>p25–p75: ${valorIndicador(unidad, f.p25)} a ${valorIndicador(unidad, f.p75)}<br/>p5–p95: ${valorIndicador(unidad, f.p05)} a ${valorIndicador(unidad, f.p95)}`
            : `${a}`;
        },
      },
      xAxis: { type: "category", data: anios.map(String), boundaryGap: false, axisLine: { lineStyle: { color: rule } }, axisLabel: { color: ink2, fontSize: 11 }, axisTick: { show: false } },
      yAxis: { type: "value", axisLabel: { color: ink2, fontSize: 11, formatter: (v: number) => valorIndicador(unidad, v) }, splitLine: { lineStyle: { color: rule, type: "dashed" } } },
      series: [
        { name: "base", type: "line", stack: "banda", symbol: "none", lineStyle: { opacity: 0 }, data: anios.map((a) => val(a, "p25")), silent: true, tooltip: { show: false } },
        {
          name: "50 % central (p25–p75)", type: "line", stack: "banda", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: acento, opacity: 0.2 }, itemStyle: { color: acento, opacity: 0.35 },
          data: anios.map((a) => { const lo = val(a, "p25"), hi = val(a, "p75"); return lo === null || hi === null ? null : hi - lo; }),
        },
        { name: "5 % y 95 %", type: "line", symbol: "none", lineStyle: { width: 1.2, type: "dashed", color: ink, opacity: 0.6 }, data: anios.map((a) => val(a, "p95")) },
        { name: "5 % y 95 % (inferior)", type: "line", symbol: "none", lineStyle: { width: 1.2, type: "dashed", color: ink, opacity: 0.6 }, data: anios.map((a) => val(a, "p05")), tooltip: { show: false } },
        { name: "Mediana", type: "line", symbolSize: 6, lineStyle: { width: 2.8, color: acento }, itemStyle: { color: acento }, data: anios.map((a) => val(a, "p50")) },
      ],
    };
  }, [anios, unidad, filas]);
  return (
    <figure>
      <Grafico opcion={opcion} etiqueta={`${nombre} por año en el sector: mediana de ${valorIndicador(unidad, filas[0]?.p50)} en ${filas[0]?.anio} a ${valorIndicador(unidad, filas[filas.length - 1]?.p50)} en ${filas[filas.length - 1]?.anio}.`} clase="h-64" />
      <details className="mt-1 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 underline underline-offset-4">Ver los datos de este gráfico</summary>
        <div tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs" aria-describedby={id}>
            <caption id={id} className="sr-only">{nombre} por año: sociedades, mediana y cuantiles</caption>
            <thead>
              <tr className="border-b border-rule">
                {["Año", "Sociedades", "p5", "p25", "Mediana", "p75", "p95"].map((h) => (
                  <th key={h} scope="col" className="py-1 pr-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.anio} className="border-b border-rule/60">
                  <th scope="row" className="py-1 pr-3 font-normal">{f.anio}</th>
                  <td className="mono py-1 pr-3">{f.n.toLocaleString("es-CO")}</td>
                  {[f.p05, f.p25, f.p50, f.p75, f.p95].map((v, i) => (
                    <td key={i} className="mono py-1 pr-3">{valorIndicador(unidad, v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
