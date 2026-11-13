"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, RadarChart } from "echarts/charts";
import { GridComponent, LegendComponent, RadarComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTema } from "@/lib/useTema";

echarts.use([BarChart, LineChart, RadarChart, GridComponent, LegendComponent, RadarComponent, TooltipComponent, CanvasRenderer]);

export type Opcion = echarts.EChartsCoreOption;

export const reducirMovimiento = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Envoltura de un gráfico de ECharts. `opcion` es una función que arma la opción y recibe si el tema es oscuro, para que los colores
 * (que se resuelven en JS desde las variables CSS) cambien con el tema. `etiqueta` es el texto alternativo: cada gráfico debe tener
 * además su tabla de datos en la página.
 */
export default function Grafico({ opcion, etiqueta, clase = "h-64" }: { opcion: (oscuro: boolean) => Opcion | null; etiqueta: string; clase?: string }) {
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
    const o = opcion(tema === "oscuro");
    if (!o) c.clear();
    else c.setOption({ animation: !reducirMovimiento(), animationDuration: 500, ...o }, true);
  }, [opcion, tema]);

  return <div ref={div} className={`w-full ${clase}`} role="img" aria-label={etiqueta} />;
}
