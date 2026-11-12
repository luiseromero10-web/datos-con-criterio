"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { RadarChart } from "echarts/charts";
import { RadarComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { cssVar, useTema } from "@/lib/useTema";
import type { EjePerfil } from "@/lib/perfil";

echarts.use([RadarChart, RadarComponent, TooltipComponent, CanvasRenderer]);

type Props = {
  municipio: string;
  departamento: string;
  ejes: EjePerfil[];
  /** datos que no caben en la araña (variación, agrupación) */
  extras: { etiqueta: string; valor: string }[];
  /** delito que se está viendo en el mapa */
  delito: string;
  /** categoría de punto caliente, si la tiene */
  categoria: string;
  onCerrar: () => void;
  /** modo comparar: empieza a elegir un segundo municipio, o lo cancela */
  eligiendo: boolean;
  onComparar: () => void;
  onCancelarComparar: () => void;
};

const ETIQUETA_CAT: Record<string, string> = {
  persistente: "Punto caliente persistente",
  emergente: "Punto caliente emergente",
  en_disminucion: "Punto caliente en disminución",
};

const reducirMovimiento = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Tarjeta con la «araña» del municipio: cinco ejes en percentil frente a todo el país, más los valores reales en texto. */
export default function PerfilMunicipio({ municipio, departamento, ejes, extras, delito, categoria, onCerrar, eligiendo, onComparar, onCancelarComparar }: Props) {
  const div = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const tema = useTema();

  // el gráfico se crea una vez; al cambiar de municipio solo se actualizan los datos (el polígono «respira» hacia los nuevos valores)
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
    if (ejes.length < 3) {
      c.clear(); // aún cargando los conteos de los delitos
      return;
    }
    const ink = cssVar("--ink", "#0b1f3a");
    const ink2 = cssVar("--ink-2", "#4a5568");
    const rule = cssVar("--rule", "#c9d3e0");
    const acento = cssVar("--senal-viva", "#2459b8");
    c.setOption({
      animation: !reducirMovimiento(),
      animationDuration: 900,
      animationEasing: "cubicOut",
      animationDurationUpdate: 600,
      tooltip: {
        confine: true,
        formatter: (p: { dataIndex?: number }) => {
          const e = ejes[p.dataIndex ?? 0];
          return e ? `<strong>${e.nombre}</strong>: percentil ${e.valor}<br/>${e.real}` : "";
        },
      },
      radar: {
        radius: "55%",
        center: ["50%", "54%"],
        startAngle: 90,
        splitNumber: 4,
        indicator: ejes.map((e) => ({ name: e.nombre.replace(" ", "\n"), max: 100 })),
        axisName: { color: ink, fontSize: 11, lineHeight: 13 },
        axisLine: { lineStyle: { color: rule } },
        splitLine: { lineStyle: { color: rule } },
        splitArea: { show: false },
      },
      series: [
        {
          type: "radar",
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { width: 2.5, color: acento },
          itemStyle: { color: acento, borderColor: cssVar("--paper", "#fff"), borderWidth: 1.5 },
          areaStyle: { color: acento, opacity: 0.28 },
          emphasis: { areaStyle: { opacity: 0.4 } },
          data: [{ value: ejes.map((e) => e.valor), name: municipio }],
        },
      ],
      textStyle: { color: ink2 },
    });
  }, [ejes, municipio, tema]);

  return (
    <div
      role="group"
      aria-label={`Perfil de ${municipio}`}
      className="panel border border-rule bg-[var(--paper)] p-4 shadow-lg sm:absolute sm:left-3 sm:top-3 sm:z-10 sm:max-h-[calc(100%-1.5rem)] sm:w-80 sm:max-w-[calc(100%-1.5rem)] sm:overflow-y-auto sm:bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] sm:backdrop-blur"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Perfil del municipio</p>
          <h3 className="display mt-1 text-xl leading-tight">{municipio}</h3>
          <p className="text-sm text-ink2">{departamento}</p>
        </div>
        <button type="button" onClick={onCerrar} className="min-h-11 min-w-11 border border-rule text-lg leading-none" aria-label="Cerrar perfil">
          ×
        </button>
      </div>
      {eligiendo ? (
        <div className="mt-3 border border-dashed border-ink p-3 text-sm" role="status">
          <p>Haga clic en <strong>otro municipio</strong> del mapa (o de las tablas) para compararlo con {municipio}.</p>
          <button type="button" onClick={onCancelarComparar} className="mt-2 min-h-11 border border-rule px-3">Cancelar</button>
        </div>
      ) : (
        <button type="button" onClick={onComparar} className="mt-3 min-h-11 w-full border border-ink px-3 font-medium hover:bg-paper2">
          Comparar con otro municipio
        </button>
      )}
      {ETIQUETA_CAT[categoria] && <p className="mono mt-2 inline-block border border-dashed border-senal px-1.5 py-0.5 text-xs text-senal">{ETIQUETA_CAT[categoria]}</p>}
      {ejes.length < 3 && <p className="mt-3 text-sm text-ink2" role="status">Calculando el perfil por tipo de delito…</p>}
      <div ref={div} className="mt-1 h-60 w-full" role="img" aria-label={`Araña de ${municipio}: ${ejes.map((e) => `${e.nombre} percentil ${e.valor}`).join(", ")}`} />
      <p className="text-xs text-ink2">Un eje por tipo de delito: la tasa por 100 mil del municipio comparada con los demás (percentil). 100 es el más alto del país.</p>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {ejes.map((e) => (
          <div key={e.id} className="contents">
            <dt className={e.id === delito ? "font-semibold" : "text-ink2"}>{e.nombre}</dt>
            <dd className="mono text-right text-xs">
              {e.real} <span className="text-ink2">· p{e.valor}</span>
            </dd>
          </div>
        ))}
      </dl>
      {extras.length > 0 && (
        <div className="mt-3 border-t border-rule pt-3">
          <p className="eyebrow mb-1">{delito === "todos" ? "Todos los delitos" : "En el delito elegido"}</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          {extras.map((x) => (
            <div key={x.etiqueta} className="contents">
              <dt className="text-ink2">{x.etiqueta}</dt>
              <dd className="mono text-right text-xs">{x.valor}</dd>
            </div>
          ))}
          </dl>
        </div>
      )}
    </div>
  );
}
