"use client";
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { LineChart, ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { cssVar, useTema } from "@/lib/useTema";
import { decimal, entero, fechaLarga } from "@/lib/format";
import type { Anomalia, Punto, PuntoPron } from "@/lib/datos";

echarts.use([LineChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, DataZoomComponent, CanvasRenderer]);

type Props = {
  titulo: string;
  serie: Punto[];
  pron: PuntoPron[];
  anomalias: Anomalia[];
  ultimaConfiable: string;
  conBanda: boolean;
};

export default function SerieTiempo({ titulo, serie, pron, anomalias, ultimaConfiable, conBanda }: Props) {
  const div = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const tema = useTema();

  const resumen = useMemo(() => {
    const confiables = serie.filter((s) => s.p <= ultimaConfiable);
    const ult = confiables[confiables.length - 1];
    const fut = pron.filter((p) => p.tipo === "futuro");
    const prom = fut.length ? fut.reduce((a, b) => a + b.p50, 0) / fut.length : null;
    return { ult, prom, nFut: fut.length };
  }, [serie, pron, ultimaConfiable]);

  const opcion = useMemo<EChartsCoreOption>(() => {
    const ink = cssVar("--ink", "#1c1a16");
    const ink2 = cssVar("--ink-2", "#57524a");
    const rule = cssVar("--rule", "#cdc4ae");
    const acento = cssVar("--accent", "#a8321a");
    const fc = cssVar("--forecast", "#1d5b57");
    const semanas = Array.from(new Set([...serie.map((s) => s.p), ...pron.map((p) => p.p)])).sort();
    const mapaObs = new Map(serie.map((s) => [s.p, s.n]));
    const mapaPron = new Map(pron.map((p) => [p.p, p]));
    const obsOk = semanas.map((w) => (mapaObs.has(w) && w <= ultimaConfiable ? mapaObs.get(w)! : null));
    const primeraProv = semanas.find((w) => w > ultimaConfiable && mapaObs.has(w));
    const ultimaObs = [...serie].map((s) => s.p).sort().pop();
    const obsProv = semanas.map((w) => (mapaObs.has(w) && (w > ultimaConfiable || w === ultimaConfiable) ? mapaObs.get(w)! : null));
    const p50 = semanas.map((w) => (mapaPron.has(w) ? mapaPron.get(w)!.p50 : null));
    const p10 = semanas.map((w) => (mapaPron.has(w) && conBanda ? mapaPron.get(w)!.p10 : null));
    const ancho = semanas.map((w) => (mapaPron.has(w) && conBanda ? mapaPron.get(w)!.p90 - mapaPron.get(w)!.p10 : null));
    const punto = (s: "alta" | "baja") => anomalias.filter((a) => a.sentido === s).map((a) => [a.p, a.valor]);
    const inicioZoom = Math.max(0, 100 - (156 / Math.max(semanas.length, 1)) * 100);
    return {
      animation: false,
      textStyle: { fontFamily: "var(--font-plex), system-ui, sans-serif", color: ink },
      grid: { left: 52, right: 16, top: 40, bottom: 64 },
      legend: { top: 0, type: "scroll", textStyle: { color: ink2, fontSize: 12 }, itemWidth: 18, itemHeight: 8 },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: cssVar("--paper", "#f3eee3"),
        borderColor: rule,
        textStyle: { color: ink, fontSize: 13 },
        formatter: (params: unknown) => {
          const ps = params as { axisValue: string; seriesName: string; value: number | [string, number] | null; marker: string }[];
          const lineas = ps
            .filter((p) => p.value !== null && p.seriesName !== "base" && !p.seriesName.startsWith("_"))
            .map((p) => `${p.marker}${p.seriesName}: <b>${decimal(Array.isArray(p.value) ? p.value[1] : (p.value as number))}</b>`);
          const w = mapaPron.get(ps[0]?.axisValue ?? "");
          const banda = w && conBanda ? `<br/>Intervalo 80 %: ${decimal(w.p10)} – ${decimal(w.p90)}` : "";
          return `Semana del ${fechaLarga(ps[0]?.axisValue ?? "")}<br/>${lineas.join("<br/>")}${banda}`;
        },
      },
      xAxis: { type: "category", data: semanas, boundaryGap: false, axisLabel: { color: ink2, formatter: (v: string) => v.slice(0, 7) }, axisLine: { lineStyle: { color: rule } }, axisTick: { show: false } },
      yAxis: { type: "value", name: "Denuncias por semana", nameTextStyle: { color: ink2, align: "left" }, axisLabel: { color: ink2 }, splitLine: { lineStyle: { color: rule, type: "dashed" } } },
      dataZoom: [
        { type: "inside", start: inicioZoom, end: 100 },
        { type: "slider", start: inicioZoom, end: 100, height: 20, bottom: 8, borderColor: rule, textStyle: { color: ink2 }, fillerColor: "rgba(168,50,26,.12)" },
      ],
      series: [
        { name: "Observado", type: "line", data: obsOk, showSymbol: false, lineStyle: { color: ink, width: 1.6 }, itemStyle: { color: ink }, z: 3 },
        {
          name: "Observado (provisional)", type: "line", data: obsProv, showSymbol: false, lineStyle: { color: ink2, width: 1.6, type: "dashed" }, itemStyle: { color: ink2 }, z: 3,
          markArea: primeraProv && ultimaObs ? { silent: true, itemStyle: { color: "rgba(150,120,60,.10)" }, label: { show: true, position: "insideTop", color: ink2, fontSize: 11, formatter: "Semanas provisionales" }, data: [[{ xAxis: primeraProv }, { xAxis: ultimaObs }]] } : undefined,
        },
        { name: "_base", type: "line", data: p10, stack: "banda", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false }, legendHoverLink: false },
        { name: "Intervalo 80 %", type: "line", data: ancho, stack: "banda", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: fc, opacity: 0.22 }, silent: true, itemStyle: { color: fc } },
        { name: "Pronóstico", type: "line", data: p50, showSymbol: false, lineStyle: { color: fc, width: 2.2 }, itemStyle: { color: fc }, z: 4 },
        { name: "Semana atípica (alta)", type: "scatter", data: punto("alta"), symbolSize: 9, itemStyle: { color: acento, borderColor: cssVar("--paper", "#fff"), borderWidth: 1 }, z: 5 },
        { name: "Semana atípica (baja)", type: "scatter", data: punto("baja"), symbol: "diamond", symbolSize: 10, itemStyle: { color: fc, borderColor: cssVar("--paper", "#fff"), borderWidth: 1 }, z: 5 },
      ],
    };
    // tema se incluye para recalcular los colores al cambiar claro/oscuro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, pron, anomalias, ultimaConfiable, conBanda, tema]);

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
    chart.current?.setOption(opcion, { notMerge: true });
  }, [opcion]);

  return (
    <figure className="m-0">
      <div ref={div} className="h-[22rem] w-full sm:h-[26rem]" role="img" aria-label={`Serie semanal de denuncias: ${titulo}, con pronóstico a ${resumen.nFut} semanas futuras.`} />
      <figcaption className="sr-only">
        {resumen.ult ? `Última semana confiable (${fechaLarga(resumen.ult.p)}): ${entero(resumen.ult.n)} denuncias. ` : ""}
        {resumen.prom !== null ? `Promedio pronosticado para las semanas futuras: ${decimal(resumen.prom)} por semana.` : ""}
      </figcaption>
    </figure>
  );
}
