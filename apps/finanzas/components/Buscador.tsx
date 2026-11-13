"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { track } from "@dcc/comunidad";
import { buscarEmpresas, type Resultado } from "@/lib/consultas";
import { nit as formatoNit, nombrePropio } from "@/lib/format";

type Props = {
  /** Si se da, elegir una sociedad llama a esta función en vez de ir a su ficha (modo comparar). */
  alElegir?: (r: Resultado) => void;
  etiqueta?: string;
  ayuda?: string;
  inicial?: string;
  autoFoco?: boolean;
};

/**
 * Buscador por NIT o razón social con sugerencias. Es un «combobox» de lista: las flechas recorren los resultados, Enter elige y Escape cierra.
 * Se busca con una pausa de 250 ms y solo desde 3 letras o 4 dígitos; lo escrito no se guarda ni se envía a ningún lado.
 */
export default function Buscador({ alElegir, etiqueta = "Buscar una sociedad por NIT o nombre", ayuda = "Escriba al menos 3 letras del nombre o 4 dígitos del NIT.", inicial = "", autoFoco = false }: Props) {
  const id = useId();
  const router = useRouter();
  const [texto, setTexto] = useState(inicial);
  const [lista, setLista] = useState<Resultado[]>([]);
  const [estado, setEstado] = useState<"quieto" | "buscando" | "listo" | "error">("quieto");
  const [activo, setActivo] = useState(-1);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLInputElement>(null);
  const marca = useRef(0);

  useEffect(() => {
    if (autoFoco) caja.current?.focus();
  }, [autoFoco]);

  useEffect(() => {
    const mia = ++marca.current;
    const t = setTimeout(async () => {
      if (texto.trim().length < 3) {
        setLista([]);
        setEstado("quieto");
        return;
      }
      setEstado("buscando");
      try {
        const r = await buscarEmpresas(texto);
        if (mia !== marca.current) return; // llegó tarde: ya se escribió otra cosa
        setLista(r);
        setActivo(-1);
        setEstado("listo");
      } catch {
        if (mia === marca.current) setEstado("error");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [texto]);

  const elegir = (r: Resultado) => {
    track("buscar_empresa");
    setAbierto(false);
    if (alElegir) {
      setTexto("");
      setLista([]);
      alElegir(r);
    }
  };

  const hayLista = abierto && estado === "listo" && lista.length > 0;
  const estadoTexto =
    estado === "buscando" ? "Buscando…" : estado === "error" ? "No se pudo buscar. Revise su conexión e intente de nuevo." : estado === "listo" && lista.length === 0 ? "No se encontraron sociedades con ese texto." : estado === "listo" ? `${lista.length} ${lista.length === 1 ? "resultado" : "resultados"}.` : "";

  return (
    <div className="relative">
      <label htmlFor={`${id}-q`} className="block font-medium">
        {etiqueta}
      </label>
      <p id={`${id}-ayuda`} className="mt-0.5 text-sm text-ink2">
        {ayuda}
      </p>
      <input
        ref={caja}
        id={`${id}-q`}
        type="text"
        role="combobox"
        aria-expanded={hayLista}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={activo >= 0 ? `${id}-o${activo}` : undefined}
        aria-describedby={`${id}-ayuda ${id}-estado`}
        autoComplete="off"
        spellCheck={false}
        value={texto}
        placeholder="Ej.: Bavaria, 860005224"
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && lista.length) {
            e.preventDefault();
            setAbierto(true);
            setActivo((a) => (a + 1) % lista.length);
          } else if (e.key === "ArrowUp" && lista.length) {
            e.preventDefault();
            setActivo((a) => (a <= 0 ? lista.length - 1 : a - 1));
          } else if (e.key === "Escape") {
            setAbierto(false);
          } else if (e.key === "Enter" && hayLista) {
            const r = lista[activo >= 0 ? activo : 0];
            if (alElegir) {
              e.preventDefault();
              elegir(r);
            } else {
              track("buscar_empresa");
              router.push(`/empresa/${r.nit}`);
            }
          }
        }}
        className="mt-2 min-h-12 w-full rounded-none border border-ink bg-paper px-3 text-lg text-ink"
      />
      <p id={`${id}-estado`} role="status" className="mt-1 min-h-6 text-sm text-ink2">
        {estadoTexto}
      </p>
      {hayLista && (
        <ul id={`${id}-lista`} role="listbox" aria-label="Sociedades encontradas" className="absolute left-0 right-0 z-20 mt-0 max-h-96 overflow-y-auto border border-ink bg-paper shadow-lg">
          {lista.map((r, i) => {
            const contenido = (
              <>
                <span className="block font-medium">{nombrePropio(r.razon_social)}</span>
                <span className="mono block text-ink2">
                  NIT {formatoNit(r.nit)} · {r.ciiu_descripcion ?? "Actividad sin dato"}
                  {r.municipio ? ` · ${r.municipio}` : ""} · último año {r.ultimo_anio}
                </span>
              </>
            );
            const clase = `block min-h-12 border-b border-rule px-3 py-2 text-left text-sm ${i === activo ? "bg-paper2" : ""} hover:bg-paper2`;
            return (
              <li key={r.nit} role="presentation">
                {alElegir ? (
                  <button type="button" role="option" id={`${id}-o${i}`} aria-selected={i === activo} tabIndex={-1} className={`${clase} w-full`} onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(r)}>
                    {contenido}
                  </button>
                ) : (
                  <Link href={`/empresa/${r.nit}`} role="option" id={`${id}-o${i}`} aria-selected={i === activo} tabIndex={-1} className={clase} onClick={() => track("buscar_empresa")} onMouseDown={(e) => e.preventDefault()}>
                    {contenido}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
