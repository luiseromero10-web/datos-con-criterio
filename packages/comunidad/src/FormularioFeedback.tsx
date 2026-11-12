"use client";
import { useId, useState, type FormEvent } from "react";
import { enviarFeedback, modoComunidad } from "./api";
import { track } from "./track";
import Turnstile from "./Turnstile";

const CAMPO = "w-full min-h-11 border border-rule bg-paper px-3 py-2 text-base text-ink rounded-none";
const TIPOS = [
  { id: "error", texto: "Algo no funciona" },
  { id: "dato", texto: "Un dato parece incorrecto" },
  { id: "idea", texto: "Tengo una idea" },
  { id: "otro", texto: "Otro" },
] as const;

/**
 * Feedback privado: solo lo ve el autor. El contacto es opcional y solo se guarda si la persona marca la autorización.
 * Si el servicio no está disponible, el botón no aparece y la app sigue funcionando.
 */
export default function FormularioFeedback() {
  const modo = modoComunidad();
  const uid = useId();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["id"]>("idea");
  const [mensajeTexto, setMensajeTexto] = useState("");
  const [contacto, setContacto] = useState("");
  const [consentimiento, setConsentimiento] = useState(false);
  const [trampa, setTrampa] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  if (modo === "inactivo") return null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setMensaje({ tipo: "error", texto: "Complete la verificación antes de enviar." });
      return;
    }
    setEnviando(true);
    setMensaje(null);
    const r = await enviarFeedback({
      ruta: window.location.pathname,
      tipo,
      mensaje: mensajeTexto,
      contacto: contacto.trim(),
      consentimiento: contacto.trim() ? consentimiento : false,
      turnstile: token,
      sitio_web: trampa,
    });
    setEnviando(false);
    if (r.ok) {
      track("feedback_enviado", tipo);
      setMensajeTexto("");
      setContacto("");
      setConsentimiento(false);
      setMensaje({ tipo: "ok", texto: modo === "simulacion" ? "Simulación: en producción el mensaje llegaría solo al autor." : "Gracias. Su mensaje llegó al autor." });
    } else setMensaje({ tipo: "error", texto: r.mensaje });
    setReinicio((n) => n + 1);
  }

  return (
    <section aria-labelledby={`${uid}-t`} className="max-w-3xl">
      <h3 id={`${uid}-t`} className="display text-xl">¿Algo que mejorar?</h3>
      <p className="mt-1 text-ink2">Escriba al autor en privado: errores, datos que no cuadran o ideas.</p>
      {modo === "simulacion" && (
        <p className="mono mt-2 border border-dashed border-rule px-2 py-1 text-xs text-ink2">Simulación (solo desarrollo): nada de lo que escriba aquí se guarda ni se envía.</p>
      )}
      <button type="button" aria-expanded={abierto} aria-controls={`${uid}-f`} onClick={() => setAbierto((a) => !a)} className="mt-3 min-h-11 border-2 border-ink px-4 py-2 font-medium hover:bg-paper2">
        {abierto ? "Cerrar" : "Dejar feedback"}
      </button>

      {abierto && (
        <form id={`${uid}-f`} onSubmit={enviar} className="relative mt-4 space-y-3" aria-label="Enviar feedback">
          <label className="block">
            <span className="eyebrow">Tipo</span>
            <select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>{t.texto}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="eyebrow">Mensaje</span>
            <textarea className={`${CAMPO} min-h-28`} value={mensajeTexto} onChange={(e) => setMensajeTexto(e.target.value)} required minLength={3} maxLength={3000} rows={5} />
            <span className="mono text-xs text-ink2">{mensajeTexto.length}/3000</span>
          </label>
          <label className="block">
            <span className="eyebrow">Contacto (opcional)</span>
            <input className={CAMPO} value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={120} autoComplete="email" />
          </label>
          {contacto.trim() && (
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1.5 h-5 w-5" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} />
              <span>Autorizo que el autor use este contacto solo para responderme.</span>
            </label>
          )}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Sitio web
              <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
            </label>
          </div>
          <Turnstile onToken={setToken} reinicio={reinicio} />
          <button type="submit" disabled={enviando || (!!contacto.trim() && !consentimiento)} className="min-h-11 border-2 border-ink bg-ink px-5 py-2 font-medium text-paper disabled:opacity-60">
            {enviando ? "Enviando…" : "Enviar feedback"}
          </button>
          <p role="status" aria-live="polite" className={mensaje?.tipo === "error" ? "text-senal" : "text-forecast"}>
            {mensaje?.texto}
          </p>
          <p className="text-sm text-ink2">
            Solo lo ve el autor. No se guarda la dirección IP. <a className="underline underline-offset-4" href="/privacidad">Privacidad</a>.
          </p>
        </form>
      )}
    </section>
  );
}
