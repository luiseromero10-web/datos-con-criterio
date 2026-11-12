import { decimal, entero, signo } from "@/lib/format";

export type CifrasDatos = {
  hechos12: number;
  hechosPrev12: number;
  tasa12: number;
  /** null cuando se ven todos los delitos: los puntos calientes se calculan por tipo de delito */
  puntosCalientes: number | null;
  semanasAtipicas: number;
};

function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="rule-top pt-3">
      <dt className="eyebrow">{etiqueta}</dt>
      <dd className="mt-1">
        <span className="cifra">{valor}</span>
        {nota && <span className="mt-1 block text-sm text-ink2">{nota}</span>}
      </dd>
    </div>
  );
}

export default function Cifras({ d }: { d: CifrasDatos | null }) {
  if (!d) {
    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4" role="status">
        <span className="sr-only">Cargando cifras…</span>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rule-top pt-3">
            <div className="h-3 w-24 bg-rule" />
            <div className="mt-3 h-9 w-32 bg-rule" />
          </div>
        ))}
      </div>
    );
  }
  const variacion = d.hechosPrev12 > 0 ? (100 * (d.hechos12 - d.hechosPrev12)) / d.hechosPrev12 : 0;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
      <Cifra etiqueta="Denuncias, 12 meses" valor={entero(d.hechos12)} nota={`${signo(variacion)} frente a los 12 meses anteriores`} />
      <Cifra etiqueta="Tasa nacional" valor={decimal(d.tasa12)} nota="por 100 000 habitantes" />
      <Cifra etiqueta="Puntos calientes" valor={d.puntosCalientes === null ? "—" : entero(d.puntosCalientes)} nota={d.puntosCalientes === null ? "se calculan por tipo de delito: elija uno" : "municipios emergentes o persistentes"} />
      <Cifra etiqueta="Semanas atípicas" valor={entero(d.semanasAtipicas)} nota="en el último año, entre departamentos y municipios" />
    </dl>
  );
}
