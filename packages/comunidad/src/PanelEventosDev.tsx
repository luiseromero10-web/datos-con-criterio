"use client";
import { useSyncExternalStore } from "react";
import { obtener, obtenerServidor, suscribir } from "./almacen";
import { APP } from "./config";
import { modo, vaciarYa } from "./track";

const hora = (t: number) => new Date(t).toLocaleTimeString("es-CO", { hour12: false });

/**
 * Panel de simulación: muestra los eventos que se enviarían, sin enviarlos. Solo existe en desarrollo
 * (en producción devuelve null), para que se pueda validar la analítica sin abrir la consola del navegador.
 */
export default function PanelEventosDev() {
  const s = useSyncExternalStore(suscribir, obtener, obtenerServidor);
  if (modo() !== "simulacion") return null;

  const eventos = s.registros.filter((r) => r.tipo === "evento");
  const conteo = new Map<string, number>();
  for (const r of eventos) conteo.set(r.texto, (conteo.get(r.texto) ?? 0) + 1);
  const recientes = [...s.registros].reverse().slice(0, 14);

  return (
    <aside
      aria-label="Panel de eventos en simulación"
      className="mono fixed bottom-3 right-3 z-50 w-[21rem] max-w-[calc(100vw-1.5rem)] border-2 border-ink bg-paper2 text-xs text-ink shadow-[4px_4px_0_0_var(--ink)]"
    >
      <details open>
      <summary className="cursor-pointer select-none px-3 py-2 font-medium">
        Eventos · simulación <span className="text-ink2">({APP})</span>
      </summary>
      <div className="space-y-2 border-t border-rule px-3 py-2">
        <p className="text-ink2">
          Solo desarrollo: nada sale de su equipo. Lotes {s.lotes}/{s.maxLotes} · en cola {s.pendientes}
        </p>
        {s.noRastrear && <p className="text-senal">«No rastrear» activo en el navegador: no se registra nada.</p>}
        <button type="button" onClick={vaciarYa} className="min-h-8 border border-ink px-2 py-1 hover:bg-paper">
          Enviar lote ahora
        </button>
        {conteo.size > 0 && (
          <div>
            <p className="text-ink2">Contados</p>
            <ul>
              {[...conteo.entries()].map(([k, n]) => (
                <li key={k} className="flex justify-between gap-3">
                  <span className="break-all">{k}</span>
                  <span>×{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div role="log" aria-label="Registro de eventos" className="max-h-40 overflow-y-auto overflow-x-hidden [overflow-wrap:anywhere]">
          <p className="text-ink2">Registro (más reciente primero)</p>
          {recientes.length === 0 ? (
            <p className="text-ink2">Aún no hay eventos. Cambie un filtro o haga clic en el mapa.</p>
          ) : (
            <ul>
              {recientes.map((r) => (
                <li key={r.id} className={r.tipo === "lote" ? "font-medium" : r.tipo === "descartado" ? "text-senal" : ""}>
                  <span className="text-ink2">{hora(r.t)}</span> {r.tipo === "lote" ? "▶ " : ""}
                  {r.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </details>
    </aside>
  );
}
