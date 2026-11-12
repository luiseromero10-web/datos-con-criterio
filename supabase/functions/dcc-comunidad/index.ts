// Edge Function dcc-comunidad (Datos con Criterio). Desplegar con verify_jwt = false: se protege aquí (origen, Turnstile, límites).
//
// Secretos que carga el autor en el panel de Supabase (Edge Functions → Secrets). Ninguno va en el repositorio:
//   TURNSTILE_SECRET   clave secreta del widget de Cloudflare Turnstile
//   DCC_SAL_HASH       texto aleatorio largo (≥ 32 caracteres) para el hash del límite diario
//   DCC_ORIGENES       orígenes permitidos separados por comas, p. ej. https://dcc-portal.vercel.app,http://localhost:3000
// Los demás los inyecta Supabase: SUPABASE_URL y SUPABASE_SECRET_KEYS (o la clave de servicio antigua como respaldo).
import { createClient } from "npm:@supabase/supabase-js@2";
import { crearManejador, type Db } from "./manejador.ts";

const llaves = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
const clave = llaves["default"] ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", clave, { auth: { persistSession: false, autoRefreshToken: false } });

function revisar<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const db: Db = {
  async listarComentarios(hilo, limite, antes) {
    let q = supabase.from("dcc_comentarios").select("id,nombre,cuerpo,respuesta_a,creado").eq("hilo", hilo).eq("estado", "aprobado").order("creado", { ascending: false }).limit(limite);
    if (antes) q = q.lt("creado", antes);
    return revisar(await q) ?? [];
  },
  async crearComentario(c) {
    revisar(await supabase.from("dcc_comentarios").insert(c));
  },
  async existeComentarioAprobado(id, hilo) {
    const filas = revisar(await supabase.from("dcc_comentarios").select("id").eq("id", id).eq("hilo", hilo).eq("estado", "aprobado").limit(1));
    return (filas?.length ?? 0) > 0;
  },
  async contarComentarios(hilos) {
    const filas = revisar(await supabase.rpc("dcc_contar_comentarios", { p_hilos: hilos })) as { hilo: string; n: number }[] | null;
    return Object.fromEntries((filas ?? []).map((f) => [f.hilo, Number(f.n)]));
  },
  async crearFeedback(f) {
    revisar(await supabase.from("dcc_feedback").insert(f));
  },
  async sumarEventos(app, eventos) {
    revisar(await supabase.rpc("dcc_sumar_eventos", { p_app: app, p_eventos: eventos }));
  },
  async tomarCupo(claveCupo, maximo) {
    return revisar(await supabase.rpc("dcc_tomar_cupo", { p_clave: claveCupo, p_maximo: maximo })) === true;
  },
};

async function verificarTurnstile(token: string): Promise<boolean> {
  const secreto = Deno.env.get("TURNSTILE_SECRET");
  if (!secreto) return false; // sin secreto no se acepta nada: falla cerrado
  const formulario = new FormData();
  formulario.append("secret", secreto);
  formulario.append("response", token);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: formulario, signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}

Deno.serve(
  crearManejador({
    db,
    verificarTurnstile,
    origenes: (Deno.env.get("DCC_ORIGENES") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    sal: Deno.env.get("DCC_SAL_HASH") ?? "",
  }),
);
