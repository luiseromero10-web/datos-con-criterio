"use client";
import { useEffect, useState } from "react";
import { DATA_URL } from "@/lib/duck";
import { nombreDelito } from "@/lib/delitos";

type Metricas = {
  metodo_elegido: string;
  cortes: string[];
  global: Record<string, { wape: number; mase: number } | number>;
  por_delito: Record<string, { wape_elegido: number; wape_mejor_base: number; mejora_pct: number }>;
  por_tramo_horizonte: Record<string, { wape_elegido: number; wape_mejor_base: number; mejora_pct: number; cobertura_80: number }>;
};

const NOMBRES: Record<string, string> = {
  SeasonalNaive: "Estacional de 52 semanas (base)",
  WindowAverage: "Media móvil de 4 semanas (base)",
  AutoETS: "AutoETS",
  AutoTheta: "AutoTheta",
  TSB: "TSB",
  LightGBM: "LightGBM",
  Promedio: "Promedio de los cuatro",
};
const f3 = (n: number) => n.toFixed(3).replace(".", ",");

export default function MetricasModelo() {
  const [m, setM] = useState<Metricas | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch(`${DATA_URL}/metrics.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("metrics"))))
      .then((j) => vivo && setM(j))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, []);
  if (error) return <p className="text-ink2">No se pudieron cargar las métricas del modelo en este momento.</p>;
  if (!m) return <p className="text-ink2" aria-busy="true">Cargando métricas…</p>;

  const filas = Object.entries(m.global).filter(([k, v]) => typeof v === "object" && NOMBRES[k]) as [string, { wape: number; mase: number }][];
  const mejora = m.global["mejora_vs_mejor_base_pct"] as number;
  return (
    <div className="space-y-8">
      <p>
        Método vigente: <strong>{NOMBRES[m.metodo_elegido] ?? m.metodo_elegido}</strong>. Frente a la mejor línea base reduce el error en{" "}
        <strong className="mono">{String(mejora).replace(".", ",")} %</strong> (WAPE, cortes de evaluación).
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <caption className="eyebrow mb-2 text-left">Error por método, cortes de evaluación (menor es mejor)</caption>
          <thead>
            <tr className="border-b-2 border-ink">
              <th scope="col" className="py-2 pr-4">Método</th>
              <th scope="col" className="py-2 pr-4 text-right">WAPE</th>
              <th scope="col" className="py-2 text-right">MASE</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([k, v]) => (
              <tr key={k} className={`border-b border-rule ${k === m.metodo_elegido ? "font-semibold" : ""}`}>
                <th scope="row" className="py-2 pr-4 font-[inherit]">{NOMBRES[k]}{k === m.metodo_elegido ? " (vigente)" : ""}</th>
                <td className="mono py-2 pr-4 text-right">{f3(v.wape)}</td>
                <td className="mono py-2 text-right">{f3(v.mase)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <caption className="eyebrow mb-2 text-left">Mejora frente a la mejor línea base, por delito</caption>
          <thead>
            <tr className="border-b-2 border-ink">
              <th scope="col" className="py-2 pr-4">Delito</th>
              <th scope="col" className="py-2 pr-4 text-right">WAPE</th>
              <th scope="col" className="py-2 pr-4 text-right">WAPE base</th>
              <th scope="col" className="py-2 text-right">Mejora</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(m.por_delito).map(([d, v]) => (
              <tr key={d} className="border-b border-rule">
                <th scope="row" className="py-2 pr-4 font-normal">{nombreDelito(d)}</th>
                <td className="mono py-2 pr-4 text-right">{f3(v.wape_elegido)}</td>
                <td className="mono py-2 pr-4 text-right">{f3(v.wape_mejor_base)}</td>
                <td className="mono py-2 text-right">{String(v.mejora_pct).replace(".", ",")} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-1 text-sm">
        {Object.entries(m.por_tramo_horizonte).map(([t, v]) => (
          <li key={t}>
            <strong>{t === "h1_8" ? "Semanas 1 a 8" : "Semanas 9 a 16"}:</strong> mejora de {String(v.mejora_pct).replace(".", ",")} % y cobertura real del intervalo del 80 % de{" "}
            <span className="mono">{f3(v.cobertura_80)}</span>.
          </li>
        ))}
      </ul>
    </div>
  );
}
