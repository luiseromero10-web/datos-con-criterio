// Manejador de peticiones de dcc-comunidad. No conoce Deno ni Supabase: recibe sus dependencias (base de datos, verificación
// de Turnstile, configuración), y por eso se prueba entero en local con dependencias de mentira.
import {
  CUPO_DIARIO,
  HILO,
  MAX_BYTES_CUERPO,
  claveDeCupo,
  diaColombia,
  ipDe,
  origenPermitido,
  validarComentario,
  validarEventos,
  validarFeedback,
  type EventoEntrada,
} from "./logica.ts";

export type ComentarioPublico = { id: string; nombre: string; cuerpo: string; respuesta_a: string | null; creado: string };

export interface Db {
  listarComentarios(hilo: string, limite: number, antes: string | null): Promise<ComentarioPublico[]>;
  crearComentario(c: { hilo: string; nombre: string; cuerpo: string; respuesta_a: string | null; app_origen: string }): Promise<void>;
  existeComentarioAprobado(id: string, hilo: string): Promise<boolean>;
  contarComentarios(hilos: string[]): Promise<Record<string, number>>;
  crearFeedback(f: { app: string; ruta: string; tipo: string; mensaje: string; contacto: string | null; consentimiento: boolean }): Promise<void>;
  sumarEventos(app: string, eventos: EventoEntrada[]): Promise<void>;
  tomarCupo(clave: string, maximo: number): Promise<boolean>;
}

export interface Deps {
  db: Db;
  verificarTurnstile(token: string): Promise<boolean>;
  /** Orígenes permitidos (DCC_ORIGENES). */
  origenes: string[];
  /** Sal para el hash del cupo (DCC_SAL_HASH). */
  sal: string;
  ahora?: () => Date;
}

const ISO = /^\d{4}-\d{2}-\d{2}T[0-9:.+Z-]{1,40}$/;

export function crearManejador(deps: Deps) {
  const ahora = deps.ahora ?? (() => new Date());
  // sin configuración mínima, las rutas que escriben se niegan en vez de funcionar a medias
  const configurado = deps.origenes.length > 0 && deps.sal.length >= 16;

  function cabeceras(origen: string | null, extra: Record<string, string> = {}): Headers {
    const h = new Headers({ "X-Content-Type-Options": "nosniff", Vary: "Origin", ...extra });
    if (origen && origenPermitido(origen, deps.origenes)) {
      h.set("Access-Control-Allow-Origin", origen);
      h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      h.set("Access-Control-Allow-Headers", "Content-Type");
      h.set("Access-Control-Max-Age", "86400");
    }
    return h;
  }

  function json(estado: number, cuerpo: unknown, origen: string | null, extra: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras(origen, { "Content-Type": "application/json; charset=utf-8", ...extra }) });
  }
  const error = (estado: number, codigo: string, origen: string | null) => json(estado, { error: codigo }, origen, { "Cache-Control": "no-store" });

  async function leerJson(req: Request): Promise<{ ok: true; valor: unknown } | { ok: false; estado: number; codigo: string }> {
    const declarado = Number(req.headers.get("content-length") ?? "0");
    if (declarado > MAX_BYTES_CUERPO) return { ok: false, estado: 413, codigo: "cuerpo_demasiado_grande" };
    const texto = await req.text();
    if (new TextEncoder().encode(texto).length > MAX_BYTES_CUERPO) return { ok: false, estado: 413, codigo: "cuerpo_demasiado_grande" };
    try {
      return { ok: true, valor: JSON.parse(texto) };
    } catch {
      return { ok: false, estado: 400, codigo: "cuerpo_invalido" };
    }
  }

  async function cupo(req: Request, tipo: string): Promise<boolean> {
    const clave = await claveDeCupo(deps.sal, diaColombia(ahora()), ipDe(req.headers), tipo);
    return deps.db.tomarCupo(clave, CUPO_DIARIO);
  }

  async function enviarComentario(req: Request, origen: string | null): Promise<Response> {
    const cuerpo = await leerJson(req);
    if (!cuerpo.ok) return error(cuerpo.estado, cuerpo.codigo, origen);
    const v = validarComentario(cuerpo.valor);
    if (!v.ok) return error(422, v.error, origen);
    const c = v.valor;
    // un robot que llena el campo trampa recibe un «todo bien» y no se guarda nada
    if (c.bot) return json(201, { ok: true, estado: "pendiente" }, origen);
    if (!(await deps.verificarTurnstile(c.turnstile))) return error(403, "verificacion_fallida", origen);
    if (!(await cupo(req, "comentario"))) return error(429, "limite_diario", origen);
    if (c.respuesta_a && !(await deps.db.existeComentarioAprobado(c.respuesta_a, c.hilo))) return error(422, "respuesta_invalida", origen);
    await deps.db.crearComentario({ hilo: c.hilo, nombre: c.nombre, cuerpo: c.cuerpo, respuesta_a: c.respuesta_a, app_origen: c.app });
    return json(201, { ok: true, estado: "pendiente" }, origen);
  }

  async function enviarFeedback(req: Request, origen: string | null): Promise<Response> {
    const cuerpo = await leerJson(req);
    if (!cuerpo.ok) return error(cuerpo.estado, cuerpo.codigo, origen);
    const v = validarFeedback(cuerpo.valor);
    if (!v.ok) return error(422, v.error, origen);
    const f = v.valor;
    if (f.bot) return json(201, { ok: true }, origen);
    if (!(await deps.verificarTurnstile(f.turnstile))) return error(403, "verificacion_fallida", origen);
    if (!(await cupo(req, "feedback"))) return error(429, "limite_diario", origen);
    await deps.db.crearFeedback({ app: f.app, ruta: f.ruta, tipo: f.tipo, mensaje: f.mensaje, contacto: f.contacto, consentimiento: f.consentimiento });
    return json(201, { ok: true }, origen);
  }

  async function recibirEventos(req: Request, origen: string | null): Promise<Response> {
    const cuerpo = await leerJson(req);
    if (!cuerpo.ok) return error(cuerpo.estado, cuerpo.codigo, origen);
    const v = validarEventos(cuerpo.valor);
    if (!v.ok) return error(400, v.error, origen);
    await deps.db.sumarEventos(v.valor.app, v.valor.eventos);
    return new Response(null, { status: 204, headers: cabeceras(origen) });
  }

  async function listarComentarios(url: URL, origen: string | null): Promise<Response> {
    const hilo = url.searchParams.get("hilo") ?? "";
    if (!HILO.test(hilo)) return error(400, "hilo_invalido", origen);
    const pedido = Number(url.searchParams.get("limite") ?? "20");
    const limite = Number.isInteger(pedido) ? Math.min(50, Math.max(1, pedido)) : 20;
    const antes = url.searchParams.get("antes");
    if (antes !== null && !ISO.test(antes)) return error(400, "cursor_invalido", origen);
    const filas = await deps.db.listarComentarios(hilo, limite + 1, antes);
    const comentarios = filas.slice(0, limite);
    return json(200, { comentarios, hay_mas: filas.length > limite }, origen, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
  }

  async function contar(url: URL, origen: string | null): Promise<Response> {
    const hilos = (url.searchParams.get("hilos") ?? "").split(",").filter(Boolean);
    if (hilos.length === 0 || hilos.length > 30 || hilos.some((h) => !HILO.test(h))) return error(400, "hilos_invalidos", origen);
    const datos = await deps.db.contarComentarios(hilos);
    const conteos = Object.fromEntries(hilos.map((h) => [h, datos[h] ?? 0]));
    return json(200, { conteos }, origen, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
  }

  return async function manejar(req: Request): Promise<Response> {
    const origen = req.headers.get("origin");
    const url = new URL(req.url);
    const ruta = url.pathname.replace(/\/+$/, "").split("/").pop() ?? "";

    try {
      if (req.method === "OPTIONS") {
        return origenPermitido(origen, deps.origenes) ? new Response(null, { status: 204, headers: cabeceras(origen) }) : error(403, "origen_no_permitido", null);
      }
      if (req.method === "GET") {
        if (ruta === "salud") return json(200, { ok: true }, origen, { "Cache-Control": "no-store" });
        if (ruta === "comentarios") return await listarComentarios(url, origen);
        if (ruta === "conteos") return await contar(url, origen);
        return error(404, "no_encontrado", origen);
      }
      if (req.method === "POST") {
        // las escrituras solo se aceptan desde los sitios de la plataforma
        if (!origenPermitido(origen, deps.origenes)) return error(403, "origen_no_permitido", null);
        if (!configurado) return error(500, "configuracion_incompleta", origen);
        if (ruta === "comentarios") return await enviarComentario(req, origen);
        if (ruta === "feedback") return await enviarFeedback(req, origen);
        if (ruta === "eventos") return await recibirEventos(req, origen);
        return error(404, "no_encontrado", origen);
      }
      return error(405, "metodo_no_permitido", origen);
    } catch (e) {
      // el detalle queda en el registro de la función; a quien llama solo se le dice que falló
      console.error("dcc-comunidad:", e instanceof Error ? e.message : String(e));
      return error(500, "error_interno", origen);
    }
  };
}
