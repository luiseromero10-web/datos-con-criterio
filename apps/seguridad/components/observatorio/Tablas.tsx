"use client";
import { useMemo } from "react";
import { decimal, entero, fechaLarga, signo } from "@/lib/format";
import type { Anomalia, Cambio, Muni } from "@/lib/datos";
import { nombreDelito } from "@/lib/delitos";

const ETIQUETA_CAT: Record<string, string> = {
  emergente: "Emergente",
  persistente: "Persistente",
  en_disminucion: "En disminución",
};

function Insignia({ cat }: { cat: string }) {
  const t = ETIQUETA_CAT[cat];
  if (!t) return null;
  return <span className="mono ml-2 border border-ink px-1.5 py-0.5 text-[11px] uppercase tracking-wider">{t}</span>;
}

export function TablaCambios({ cambios, munis, onSeleccion, minimo = 30, todos = false }: { cambios: Cambio[]; munis: Muni[]; onSeleccion: (cod: string) => void; minimo?: number; todos?: boolean }) {
  const porCod = useMemo(() => new Map(munis.map((m) => [m.cod_mpio, m])), [munis]);
  const filas = useMemo(() => {
    const base = cambios.filter((c) => c.prev >= minimo).map((c) => ({ ...c, pct: (100 * (c.ult - c.prev)) / c.prev }));
    const suben = [...base].sort((a, b) => b.pct - a.pct).slice(0, 6);
    const bajan = [...base].sort((a, b) => a.pct - b.pct).slice(0, 6);
    return { suben, bajan };
  }, [cambios, minimo]);

  const bloque = (titulo: string, datos: (Cambio & { pct: number })[]) => (
    <div>
      <h3 className="eyebrow mb-2">{titulo}</h3>
      <ul className="divide-y divide-rule border-y border-rule">
        {datos.map((c) => {
          const m = porCod.get(c.cod_mpio);
          return (
            <li key={c.cod_mpio}>
              <button type="button" onClick={() => onSeleccion(c.cod_mpio)} className="flex w-full min-h-11 items-baseline justify-between gap-3 py-2 text-left hover:bg-paper2">
                <span>
                  <span className="font-medium">{m?.municipio ?? c.cod_mpio}</span>
                  <span className="text-ink2"> · {m?.departamento}</span>
                  <Insignia cat={c.categoria} />
                </span>
                <span className="mono shrink-0 text-right text-sm">
                  <span className={c.pct >= 0 ? "text-senal" : "text-forecast"}>{signo(c.pct)}</span>
                  <span className="block text-xs text-ink2">{entero(c.prev)} → {entero(c.ult)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {bloque("Más aumento (12 meses frente a los 12 anteriores)", filas.suben)}
      {bloque("Más disminución", filas.bajan)}
      <p className="text-sm text-ink2 md:col-span-2">
        Solo municipios con al menos {minimo} denuncias en el periodo anterior, para no leer ruido de cifras pequeñas. {todos ? "Con «Todos los delitos» se suman los conteos; las etiquetas de punto caliente solo existen por tipo de delito." : "«Emergente», «persistente» y «en disminución» vienen del análisis de puntos calientes (Gi*, FDR 5 %)."}
      </p>
    </div>
  );
}

export function TablaAnomalias({ anomalias, munis, onSeleccion, todos = false }: { anomalias: Anomalia[]; munis: Muni[]; onSeleccion: (cod: string) => void; todos?: boolean }) {
  const mp = useMemo(() => new Map(munis.map((m) => [m.cod_mpio, m])), [munis]);
  const dp = useMemo(() => new Map(munis.map((m) => [m.cod_dpto, m.departamento])), [munis]);
  return (
    <div>
      <ul className="divide-y divide-rule border-y border-rule">
        {anomalias.slice(0, 8).map((a) => {
          const nombre = a.nivel === "dpto" ? dp.get(a.cod) : mp.get(a.cod)?.municipio;
          const depto = a.nivel === "mpio" ? mp.get(a.cod)?.departamento : "departamento";
          return (
            <li key={`${a.delito}-${a.p}-${a.nivel}-${a.cod}`}>
              <button
                type="button"
                onClick={() => (a.nivel === "mpio" ? onSeleccion(a.cod) : undefined)}
                disabled={a.nivel !== "mpio"}
                className="flex w-full min-h-11 items-baseline justify-between gap-3 py-2 text-left enabled:hover:bg-paper2"
              >
                <span>
                  <span className="font-medium">{nombre ?? a.cod}</span>
                  <span className="text-ink2"> · {depto}</span>
                  <span className="block text-xs text-ink2">Semana del {fechaLarga(a.p)}{todos && a.delito ? ` · ${nombreDelito(a.delito)}` : ""}</span>
                </span>
                <span className="mono shrink-0 text-right text-sm">
                  <span className={a.sentido === "alta" ? "text-senal" : "text-forecast"}>{entero(a.valor)}</span>
                  <span className="block text-xs text-ink2">esperado {decimal(a.esperado)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-ink2">
        Puntaje robusto |z| &gt; 3 frente a la mediana de las 26 semanas anteriores. Una semana atípica es una señal para mirar el contexto, no una conclusión.
      </p>
    </div>
  );
}
