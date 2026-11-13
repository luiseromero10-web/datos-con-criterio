import type { Metadata } from "next";
import Link from "next/link";
import Aviso from "@/components/Aviso";
import Buscador from "@/components/Buscador";
import Comunidad from "@/components/Comunidad";

export const metadata: Metadata = {
  title: "Radiografía financiera de empresas",
  description: "Busque una sociedad por NIT o nombre y vea diez años de ingresos, márgenes, liquidez y endeudamiento frente a sociedades de su sector y tamaño.",
};

// Algunas sociedades conocidas para probar. Son datos públicos que ellas mismas reportaron.
const EJEMPLOS = [
  { nit: 860005224, nombre: "Bavaria & Cía." },
  { nit: 890903939, nombre: "Postobón" },
  { nit: 860025900, nombre: "Alpina Productos Alimenticios" },
  { nit: 900480569, nombre: "Jerónimo Martins Colombia" },
  { nit: 800068713, nombre: "Oleoducto de Colombia" },
];

export default function Inicio() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
      <p className="eyebrow reveal">Caso 02 · Radiografía financiera de empresas</p>
      <h1 className="display reveal mt-3 max-w-4xl text-4xl font-semibold leading-[1.02] sm:text-6xl" style={{ animationDelay: ".08s" }}>
        ¿Cómo está una empresa frente a las de su sector?
      </h1>

      <aside className="reveal mt-8 max-w-3xl border-l-4 border-accent bg-paper2 p-5" style={{ animationDelay: ".16s" }} aria-label="Memo ejecutivo">
        <p className="eyebrow">Memo ejecutivo</p>
        <p className="mt-2 border border-dashed border-rule p-3 text-ink2">
          Pendiente: el autor lo redacta con estructura de pirámide (idea principal y tres argumentos) al cierre del caso. Mientras tanto, las cifras de abajo salen directamente de los estados que las sociedades reportaron a la Supersociedades.
        </p>
      </aside>

      <section aria-label="Buscador" className="mt-10 max-w-3xl">
        <Buscador autoFoco />
        <p className="mt-4 text-sm text-ink2">
          Pruebe con:{" "}
          {EJEMPLOS.map((e, i) => (
            <span key={e.nit}>
              <Link className="underline underline-offset-4" href={`/empresa/${e.nit}`}>{e.nombre}</Link>
              {i < EJEMPLOS.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>
      </section>

      <section className="mt-14 grid gap-8 sm:grid-cols-3" aria-label="Qué encuentra aquí">
        <div>
          <p className="eyebrow">01</p>
          <h2 className="display mt-1 text-xl">Una ficha por sociedad</h2>
          <p className="mt-2 text-sm text-ink2">Diez años de ingresos, márgenes, liquidez y endeudamiento, y su posición frente a sociedades de su sector y tamaño (percentiles).</p>
        </div>
        <div>
          <p className="eyebrow">02</p>
          <h2 className="display mt-1 text-xl">
            <Link href="/comparar" className="underline-offset-4 hover:underline">Comparar dos sociedades</Link>
          </h2>
          <p className="mt-2 text-sm text-ink2">Dos arañas, una tabla y una lectura en palabras de en qué indicadores una está mejor que la otra.</p>
        </div>
        <div>
          <p className="eyebrow">03</p>
          <h2 className="display mt-1 text-xl">
            <Link href="/sector" className="underline-offset-4 hover:underline">Sectores</Link>
          </h2>
          <p className="mt-2 text-sm text-ink2">Cómo se distribuye cada indicador en un sector, cuánto crece en términos reales y dónde se concentra el perfil de riesgo.</p>
        </div>
      </section>

      <Aviso />
      <Comunidad />
    </div>
  );
}
