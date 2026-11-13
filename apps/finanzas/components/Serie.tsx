"use client";
import { useCallback, useId } from "react";
import Grafico from "./Grafico";
import { pesos, valorIndicador, type Unidad } from "@/lib/format";
import { cssVar } from "@/lib/useTema";

export type PuntoSerie = { anio: number; valor: number | null };
export type SerieLinea = { nombre: string; puntos: PuntoSerie[]; color?: "acento" | "tinta" | "senal" | "cerulea" };

type Formato = Unidad | "pesos";
const fmt = (f: Formato, v: number | null) => (f === "pesos" ? pesos(v) : valorIndicador(f, v));

/** Límite de lo que se dibuja: un indicador con un valor absurdo (viene de la fuente) no aplasta la escala; la tabla y el tooltip muestran el valor real. */
const LIMITE: Record<Formato, [number, number]> = { fraccion: [-3, 3], veces: [-20, 20], dias: [-500, 1500], pesos: [-Infinity, Infinity] };
const acotar = (f: Formato, v: number) => Math.min(Math.max(v, LIMITE[f][0]), LIMITE[f][1]);

/**
 * Serie anual de una o varias variables, con su tabla de datos plegable (alternativa accesible al gráfico).
 * `barras` dibuja barras en lugar de líneas (para cifras en pesos).
 */
export default function Serie({ titulo, anios, series, formato, barras = false, nota }: { titulo: string; anios: number[]; series: SerieLinea[]; formato: Formato; barras?: boolean; nota?: string }) {
  const id = useId();
  const opcion = useCallback(
    () => {
      const ink = cssVar("--ink", "#0b1f3a");
      const ink2 = cssVar("--ink-2", "#465a76");
      const rule = cssVar("--rule", "#c8d5e8");
      const col = { acento: cssVar("--accent", "#1f45c4"), tinta: ink, senal: cssVar("--senal-viva", "#f59e0b"), cerulea: cssVar("--forecast", "#0b72a8") };
      const orden: SerieLinea["color"][] = ["acento", "cerulea", "senal", "tinta"];
      return {
        grid: { left: 8, right: 16, top: series.length > 1 ? 34 : 14, bottom: 4, containLabel: true },
        legend: series.length > 1 ? { top: 0, textStyle: { color: ink, fontSize: 11 }, icon: "roundRect", itemWidth: 14, itemHeight: 3 } : { show: false },
        tooltip: {
          trigger: "axis",
          confine: true,
          formatter: (ps: { axisValue: string; seriesName: string; data: { real: number | null }; color: string }[]) =>
            `<strong>${ps[0]?.axisValue}</strong><br/>` + ps.map((p) => `<span style="color:${p.color}">●</span> ${p.seriesName}: ${fmt(formato, p.data.real)}`).join("<br/>"),
        },
        xAxis: { type: "category", data: anios.map(String), axisLine: { lineStyle: { color: rule } }, axisLabel: { color: ink2, fontSize: 11 }, axisTick: { show: false } },
        yAxis: {
          type: "value",
          axisLabel: { color: ink2, fontSize: 11, formatter: (v: number) => (formato === "pesos" ? pesos(v).replace("$ ", "") : fmt(formato, v)) },
          splitLine: { lineStyle: { color: rule, type: "dashed" } },
        },
        series: series.map((s, i) => ({
          type: barras ? "bar" : "line",
          name: s.nombre,
          color: col[s.color ?? orden[i % orden.length] ?? "acento"],
          connectNulls: false,
          symbolSize: 6,
          lineStyle: { width: 2.5 },
          data: anios.map((a) => {
            const v = s.puntos.find((p) => p.anio === a)?.valor ?? null;
            return { value: v === null ? null : acotar(formato, v), real: v };
          }),
        })),
      };
    },
    [anios, series, formato, barras],
  );
  const resumen = `${titulo}: ${series.map((s) => `${s.nombre}, de ${fmt(formato, s.puntos.find((p) => p.valor !== null)?.valor ?? null)} en ${s.puntos.find((p) => p.valor !== null)?.anio ?? "–"} a ${fmt(formato, [...s.puntos].reverse().find((p) => p.valor !== null)?.valor ?? null)} en ${[...s.puntos].reverse().find((p) => p.valor !== null)?.anio ?? "–"}`).join("; ")}.`;
  return (
    <figure className="min-w-0">
      <figcaption className="eyebrow">{titulo}</figcaption>
      <Grafico opcion={opcion} etiqueta={resumen} clase="h-52" />
      {nota && <p className="text-xs text-ink2">{nota}</p>}
      <details className="mt-1 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 underline underline-offset-4">Ver los datos de este gráfico</summary>
        <div tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs" aria-describedby={id}>
            <caption id={id} className="sr-only">
              {titulo}
            </caption>
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="py-1 pr-3 font-medium">Año</th>
                {series.map((s) => (
                  <th key={s.nombre} scope="col" className="py-1 pr-3 font-medium">
                    {s.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anios.map((a) => (
                <tr key={a} className="border-b border-rule/60">
                  <th scope="row" className="py-1 pr-3 font-normal">{a}</th>
                  {series.map((s) => (
                    <td key={s.nombre} className="mono py-1 pr-3">
                      {fmt(formato, s.puntos.find((p) => p.anio === a)?.valor ?? null)}
                    </td>
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
