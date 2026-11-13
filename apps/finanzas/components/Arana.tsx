"use client";
import { useCallback } from "react";
import Grafico from "./Grafico";
import { cssVar } from "@/lib/useTema";
import type { Eje } from "@/lib/perfil";

export type SerieArana = { nombre: string; ejes: Eje[]; color: "acento" | "senal" };

/**
 * Araña de indicadores en percentil frente a los pares (100 = mejor que casi todos, 50 = la mediana de sus pares). En los indicadores donde
 * menos es mejor (endeudamiento, días de cartera) el percentil ya viene invertido. El anillo punteado del 50 es la mediana de los pares.
 */
export default function Arana({ series, ids, etiqueta }: { series: SerieArana[]; ids: { id: string; nombre: string }[]; etiqueta: string }) {
  const opcion = useCallback(
    () => {
      if (ids.length < 3) return null;
      const ink = cssVar("--ink", "#0b1f3a");
      const rule = cssVar("--rule", "#c8d5e8");
      const colores = { acento: cssVar("--accent", "#1f45c4"), senal: cssVar("--senal-viva", "#f59e0b") };
      const valor = (s: SerieArana, id: string) => s.ejes.find((e) => e.id === id)?.valor ?? 0;
      return {
        tooltip: {
          confine: true,
          formatter: (p: { seriesName?: string; dataIndex?: number }) => {
            const s = series.find((x) => x.nombre === p.seriesName);
            const e = s?.ejes.find((x) => x.id === ids[p.dataIndex ?? 0]?.id);
            return s && e ? `<strong>${s.nombre}</strong><br/>${e.nombre}: percentil ${e.valor}<br/>${e.real}` : "";
          },
        },
        radar: {
          radius: "58%",
          center: ["50%", "52%"],
          startAngle: 90,
          splitNumber: 4,
          indicator: ids.map((e) => ({ name: e.nombre.replace(" ", "\n"), max: 100 })),
          axisName: { color: ink, fontSize: 11, lineHeight: 13 },
          axisLine: { lineStyle: { color: rule } },
          splitLine: { lineStyle: { color: rule } },
          splitArea: { show: false },
        },
        series: [
          {
            type: "radar",
            name: "Mediana de pares",
            symbol: "none",
            lineStyle: { width: 1.5, type: "dashed", color: ink, opacity: 0.6 },
            areaStyle: { opacity: 0 },
            data: [{ value: ids.map(() => 50), name: "Mediana de pares" }],
            silent: true,
          },
          ...series.map((s) => ({
            type: "radar" as const,
            name: s.nombre,
            symbol: "circle",
            symbolSize: 7,
            lineStyle: { width: 2.5, color: colores[s.color] },
            itemStyle: { color: colores[s.color], borderColor: cssVar("--paper", "#fff"), borderWidth: 1.5 },
            areaStyle: { color: colores[s.color], opacity: 0.22 },
            data: [{ value: ids.map((e) => valor(s, e.id)), name: s.nombre }],
          })),
        ],
      };
    },
    [series, ids],
  );
  return <Grafico opcion={opcion} etiqueta={etiqueta} clase="h-72 sm:h-80" />;
}
