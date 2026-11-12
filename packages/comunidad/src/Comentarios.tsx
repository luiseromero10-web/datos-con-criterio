"use client";
import { useId, useMemo, useState, type FormEvent } from "react";
import { enviarComentario, listarComentarios, modoComunidad, type ComentarioPublico } from "./api";
import { track } from "./track";
import Turnstile from "./Turnstile";

type Estado = "cerrado" | "cargando" | "listo" | "error";

const CAMPO = "w-full min-h-11 border border-rule bg-paper px-3 py-2 text-base text-ink rounded-none";
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

function Hilo({ c, respuestas }: { c: ComentarioPublico; respuestas: ComentarioPublico[] }) {
  return (
    <li className="py-4">
      <p className="text-sm">
        <strong>{c.nombre}</strong> <span className="text-ink2">· {fecha(c.creado)}</span>
      </p>
      <p className="mt-1 whitespace-pre-line break-words">{c.cuerpo}</p>
      {respuestas.length > 0 && (
        <ul className="mt-3 space-y-3 border-l-2 border-rule pl-4">
          {respuestas.map((r) => (
            <li key={r.id}>
              <p className="text-sm">
                <strong>{r.nombre}</strong> <span className="text-ink2">· {fecha(r.creado)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line break-words">{r.cuerpo}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Comentarios de un hilo (`app:<id>` o `articulo:<slug>`), con moderación previa. La lista se pide solo cuando la persona la abre,
 * para cuidar la cuota de la función. Si el servicio no está disponible (apagado, sin configurar o sin conexión) la página sigue funcionando.
 */
export default function Comentarios({ hilo, titulo = "Comentarios" }: { hilo: string; titulo?: string }) {
  const modo = modoComunidad();
  const uid = useId();
  const [estado, setEstado] = useState<Estado>("cerrado");
  const [lista, setLista] = useState<ComentarioPublico[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [trampa, setTrampa] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const hilos = useMemo(() => {
    const ids = new Set(lista.map((c) => c.id));
    const raices = lista.filter((c) => !c.respuesta_a || !ids.has(c.respuesta_a));
    return raices.map((c) => ({
      c,
      respuestas: lista.filter((r) => r.respuesta_a === c.id).sort((a, b) => a.creado.localeCompare(b.creado)),
    }));
  }, [lista]);

  if (modo === "inactivo") {
    return (
      <section aria-labelledby={`${uid}-t`} className="max-w-3xl">
        <h3 id={`${uid}-t`} className="display text-xl">{titulo}</h3>
        <p className="mt-2 text-ink2">Los comentarios no están disponibles por ahora. El resto de la página funciona con normalidad.</p>
      </section>
    );
  }

  async function abrir() {
    setEstado("cargando");
    const r = await listarComentarios(hilo);
    if (r.ok) {
      setLista(r.comentarios);
      setHayMas(r.hayMas);
      setEstado("listo");
    } else setEstado("error");
  }

  async function verMas() {
    const r = await listarComentarios(hilo, lista[lista.length - 1]?.creado);
    if (r.ok) {
      setLista((l) => [...l, ...r.comentarios]);
      setHayMas(r.hayMas);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setMensaje({ tipo: "error", texto: "Complete la verificación antes de enviar." });
      return;
    }
    setEnviando(true);
    setMensaje(null);
    const r = await enviarComentario({ hilo, nombre, cuerpo, turnstile: token, sitio_web: trampa });
    setEnviando(false);
    if (r.ok) {
      track("comentario_enviado");
      setNombre("");
      setCuerpo("");
      setMensaje({
        tipo: "ok",
        texto: modo === "simulacion" ? "Simulación: en producción su comentario quedaría pendiente de aprobación." : "Gracias. Su comentario se publicará cuando el autor lo apruebe.",
      });
    } else setMensaje({ tipo: "error", texto: r.mensaje });
    setReinicio((n) => n + 1); // cada verificación sirve una sola vez
  }

  return (
    <section aria-labelledby={`${uid}-t`} className="max-w-3xl">
      <h3 id={`${uid}-t`} className="display text-xl">{titulo}</h3>
      {modo === "simulacion" && (
        <p className="mono mt-2 border border-dashed border-rule px-2 py-1 text-xs text-ink2">Simulación (solo desarrollo): nada de lo que escriba aquí se guarda ni se envía.</p>
      )}

      {estado === "cerrado" && (
        <button type="button" onClick={abrir} className="mt-3 min-h-11 border-2 border-ink px-4 py-2 font-medium hover:bg-paper2">
          Ver y escribir comentarios
        </button>
      )}
      {estado === "cargando" && <p className="mt-3 text-ink2" role="status">Cargando comentarios…</p>}
      {estado === "error" && (
        <p className="mt-3 text-ink2" role="status">
          No se pudieron cargar los comentarios por ahora.{" "}
          <button type="button" onClick={abrir} className="underline underline-offset-4">Reintentar</button>
        </p>
      )}

      {estado === "listo" && (
        <>
          {hilos.length === 0 ? (
            <p className="mt-3 text-ink2">Aún no hay comentarios. Sea la primera persona en escribir.</p>
          ) : (
            <ul className="mt-2 divide-y divide-rule border-y border-rule">
              {hilos.map(({ c, respuestas }) => (
                <Hilo key={c.id} c={c} respuestas={respuestas} />
              ))}
            </ul>
          )}
          {hayMas && (
            <button type="button" onClick={verMas} className="mt-3 min-h-11 underline underline-offset-4">
              Ver más comentarios
            </button>
          )}

          <form onSubmit={enviar} className="relative mt-6 space-y-3" aria-label="Escribir un comentario">
            <label className="block">
              <span className="eyebrow">Nombre o seudónimo</span>
              <input className={CAMPO} value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={60} autoComplete="nickname" />
            </label>
            <label className="block">
              <span className="eyebrow">Comentario</span>
              <textarea className={`${CAMPO} min-h-28`} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} required minLength={3} maxLength={2000} rows={4} />
              <span className="mono text-xs text-ink2">{cuerpo.length}/2000</span>
            </label>
            {/* campo trampa: las personas no lo ven; los robots suelen llenarlo */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Sitio web
                <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
              </label>
            </div>
            <Turnstile onToken={setToken} reinicio={reinicio} />
            <button type="submit" disabled={enviando} className="min-h-11 border-2 border-ink bg-ink px-5 py-2 font-medium text-paper disabled:opacity-60">
              {enviando ? "Enviando…" : "Enviar comentario"}
            </button>
            <p role="status" aria-live="polite" className={mensaje?.tipo === "error" ? "text-senal" : "text-forecast"}>
              {mensaje?.texto}
            </p>
            <p className="text-sm text-ink2">
              Los comentarios se publican cuando el autor los aprueba. No se pide correo y no se guarda la dirección IP.{" "}
              <a className="underline underline-offset-4" href="/privacidad">Privacidad</a>.
            </p>
          </form>
        </>
      )}
    </section>
  );
}
