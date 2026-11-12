"use client";
import { DELITOS, type DelitoId } from "@/lib/delitos";
import type { Muni, Periodo } from "@/lib/datos";

type Props = {
  delito: DelitoId;
  onDelito: (d: DelitoId) => void;
  dpto: string;
  onDpto: (c: string) => void;
  mpio: string;
  onMpio: (c: string) => void;
  periodo: string;
  onPeriodo: (p: string) => void;
  periodos: Periodo[];
  munis: Muni[];
};

const campo =
  "w-full min-h-11 border border-rule bg-paper px-3 py-2 text-base text-ink disabled:opacity-50 rounded-none appearance-none bg-[length:12px] bg-no-repeat bg-[right_0.75rem_center]";
const flecha =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23888' stroke-width='2'/%3E%3C/svg%3E\")] pr-9";

export default function Filtros({ delito, onDelito, dpto, onDpto, mpio, onMpio, periodo, onPeriodo, periodos, munis }: Props) {
  const departamentos = Array.from(new Map(munis.map((m) => [m.cod_dpto, m.departamento])).entries());
  const delDpto = munis.filter((m) => m.cod_dpto === dpto);
  return (
    <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros del observatorio" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Delito</span>
        <select className={`${campo} ${flecha}`} value={delito} onChange={(e) => onDelito(e.target.value as DelitoId)}>
          {DELITOS.map((d) => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Departamento</span>
        <select className={`${campo} ${flecha}`} value={dpto} onChange={(e) => onDpto(e.target.value)}>
          <option value="">Todo el país</option>
          {departamentos.map(([cod, nombre]) => (
            <option key={cod} value={cod}>{nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Municipio</span>
        <select className={`${campo} ${flecha}`} value={mpio} onChange={(e) => onMpio(e.target.value)} disabled={!dpto}>
          <option value="">{dpto ? "Todos los municipios" : "Elija un departamento"}</option>
          {delDpto.map((m) => (
            <option key={m.cod_mpio} value={m.cod_mpio}>{m.municipio}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Periodo del mapa</span>
        <select className={`${campo} ${flecha}`} value={periodo} onChange={(e) => onPeriodo(e.target.value)}>
          {periodos.map((p) => (
            <option key={p.id} value={p.id}>{p.etiqueta}</option>
          ))}
        </select>
      </label>
    </form>
  );
}
