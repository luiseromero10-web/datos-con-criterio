"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listarSectores, type OpcionSector } from "@/lib/consultas";
import { entero } from "@/lib/format";
import { tituloNivel } from "@/lib/sectores";
import { useBase } from "@/lib/usar";

export default function SectorLista() {
  const base = useBase();
  const [lista, setLista] = useState<OpcionSector[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarSectores()
      .then((l) => vivo && setLista(l))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "Error de lectura"));
    return () => {
      vivo = false;
    };
  }, []);

  if (error || base.estado === "error") return <div role="alert" className="py-8">No se pudieron cargar los sectores. {error ?? (base.estado === "error" ? base.mensaje : "")} Recargue la página.</div>;
  if (!lista) return <div role="status" className="py-8 text-ink2">Cargando sectores… (la primera vez tarda unos segundos)</div>;

  const secciones = lista.filter((s) => s.nivel === "seccion");
  const divisiones = lista.filter((s) => s.nivel === "ciiu2");
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-2">
      <section aria-labelledby="secciones">
        <h2 id="secciones" className="display text-2xl">Secciones</h2>
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {secciones.map((s) => (
            <li key={s.codigo}>
              <Link href={`/sector/${s.codigo}`} className="flex min-h-11 items-baseline justify-between gap-4 py-2 hover:bg-paper2">
                <span><span className="mono mr-2">{s.codigo}</span><span className="underline underline-offset-4">{s.nombre}</span></span>
                <span className="mono shrink-0 text-xs text-ink2">{entero(s.n_empresas)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="divisiones">
        <h2 id="divisiones" className="display text-2xl">Divisiones</h2>
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {divisiones.map((s) => (
            <li key={s.codigo}>
              <Link href={`/sector/${s.codigo}`} className="flex min-h-11 items-baseline justify-between gap-4 py-2 hover:bg-paper2">
                <span><span className="mono mr-2">{s.codigo}</span><span className="underline underline-offset-4">{s.nombre}</span></span>
                <span className="mono shrink-0 text-xs text-ink2">{entero(s.n_empresas)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-ink2 lg:col-span-2">Cada número es la cantidad de sociedades con estados en el último año. {tituloNivel.ciiu4}s (cuatro dígitos) están dentro de cada división.</p>
    </div>
  );
}
