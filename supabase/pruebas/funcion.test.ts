import { describe, expect, it, vi } from "vitest";
import { crearManejador, type ComentarioPublico, type Db } from "../functions/dcc-comunidad/manejador.ts";
import { claveDeCupo, diaColombia, ipDe, limpiarTexto, origenPermitido, validarEventos } from "../functions/dcc-comunidad/logica.ts";

const ORIGEN = "https://dcc-portal.vercel.app";
const SAL = "sal-de-prueba-larga-0123456789abcdef";
const BASE = "https://ejemplo.supabase.co/functions/v1/dcc-comunidad";

function montar(opciones: { turnstile?: boolean; cupos?: number; origenes?: string[]; sal?: string; aprobados?: string[]; comentarios?: ComentarioPublico[] } = {}) {
  const llamadas = {
    crearComentario: [] as Parameters<Db["crearComentario"]>[0][],
    crearFeedback: [] as Parameters<Db["crearFeedback"]>[0][],
    sumarEventos: [] as { app: string; eventos: unknown[] }[],
    claves: [] as string[],
  };
  let cupo = opciones.cupos ?? 5;
  const db: Db = {
    listarComentarios: vi.fn(async (_h, limite) => (opciones.comentarios ?? []).slice(0, limite)),
    crearComentario: vi.fn(async (c) => void llamadas.crearComentario.push(c)),
    existeComentarioAprobado: vi.fn(async (id) => (opciones.aprobados ?? []).includes(id)),
    contarComentarios: vi.fn(async () => ({ "articulo:uno": 3 })),
    crearFeedback: vi.fn(async (f) => void llamadas.crearFeedback.push(f)),
    sumarEventos: vi.fn(async (app, eventos) => void llamadas.sumarEventos.push({ app, eventos })),
    tomarCupo: vi.fn(async (clave) => {
      llamadas.claves.push(clave);
      cupo -= 1;
      return cupo >= 0;
    }),
  };
  const verificarTurnstile = vi.fn(async () => opciones.turnstile ?? true);
  const manejar = crearManejador({
    db,
    verificarTurnstile,
    origenes: opciones.origenes ?? [ORIGEN, "http://localhost:3000"],
    sal: opciones.sal ?? SAL,
    ahora: () => new Date("2026-11-12T15:00:00Z"),
  });
  return { manejar, db, verificarTurnstile, llamadas };
}

const post = (ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = { origin: ORIGEN }) =>
  new Request(`${BASE}/${ruta}`, { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8", ...cabeceras }, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });
const get = (ruta: string, cabeceras: Record<string, string> = { origin: ORIGEN }) => new Request(`${BASE}/${ruta}`, { headers: cabeceras });
const lee = async (r: Response) => JSON.parse(await r.text());

const comentario = { hilo: "app:seguridad", nombre: "Ana", cuerpo: "Muy útil, gracias.", app: "seguridad", turnstile: "token-ok", sitio_web: "" };

describe("origen y CORS", () => {
  it("responde la comprobación previa solo a los orígenes de la plataforma", async () => {
    const { manejar } = montar();
    const si = await manejar(new Request(`${BASE}/comentarios`, { method: "OPTIONS", headers: { origin: ORIGEN } }));
    expect(si.status).toBe(204);
    expect(si.headers.get("access-control-allow-origin")).toBe(ORIGEN);
    const no = await manejar(new Request(`${BASE}/comentarios`, { method: "OPTIONS", headers: { origin: "https://malo.com" } }));
    expect(no.status).toBe(403);
    expect(no.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("niega las escrituras desde otro origen o sin origen, sin tocar nada", async () => {
    const { manejar, db, verificarTurnstile } = montar();
    for (const cab of [{ origin: "https://malo.com" }, {}]) {
      for (const ruta of ["comentarios", "feedback", "eventos"]) {
        const r = await manejar(post(ruta, comentario, cab));
        expect(r.status).toBe(403);
        expect((await lee(r)).error).toBe("origen_no_permitido");
      }
    }
    expect(db.crearComentario).not.toHaveBeenCalled();
    expect(db.sumarEventos).not.toHaveBeenCalled();
    expect(verificarTurnstile).not.toHaveBeenCalled();
  });

  it("origenPermitido admite comodines de un segmento (vistas previas) pero no dominios ajenos", () => {
    const lista = ["https://dcc-portal-*.vercel.app", "https://luiseromero.com"];
    expect(origenPermitido("https://dcc-portal-git-main-luis.vercel.app", lista)).toBe(true);
    expect(origenPermitido("https://luiseromero.com/", lista)).toBe(true);
    expect(origenPermitido("https://dcc-portal-x.vercel.app.malo.com", lista)).toBe(false);
    expect(origenPermitido("https://otro.vercel.app", lista)).toBe(false);
    expect(origenPermitido(null, lista)).toBe(false);
  });

  it("si falta configuración (orígenes o sal corta), las escrituras se niegan en lugar de funcionar a medias", async () => {
    for (const cfg of [{ sal: "corta" }, { origenes: [] as string[] }]) {
      const { manejar } = montar(cfg);
      const r = await manejar(post("eventos", { app: "seguridad", eventos: [{ evento: "vista_app", propiedad: "", n: 1 }] }, { origin: ORIGEN }));
      expect([403, 500]).toContain(r.status);
      if (cfg.sal) expect((await lee(r)).error).toBe("configuracion_incompleta");
    }
  });
});

describe("POST /comentarios", () => {
  it("guarda un comentario válido como pendiente, tras verificar Turnstile y tomar cupo", async () => {
    const { manejar, llamadas, verificarTurnstile } = montar();
    const r = await manejar(post("comentarios", comentario));
    expect(r.status).toBe(201);
    expect(await lee(r)).toEqual({ ok: true, estado: "pendiente" });
    expect(verificarTurnstile).toHaveBeenCalledWith("token-ok");
    expect(llamadas.crearComentario).toEqual([{ hilo: "app:seguridad", nombre: "Ana", cuerpo: "Muy útil, gracias.", respuesta_a: null, app_origen: "seguridad" }]);
  });

  it("no guarda ni la IP, ni el token, ni cabeceras: el registro tiene solo los 5 campos esperados", async () => {
    const { manejar, llamadas } = montar();
    await manejar(post("comentarios", comentario, { origin: ORIGEN, "x-forwarded-for": "203.0.113.7", "user-agent": "Mozilla/5.0" }));
    expect(Object.keys(llamadas.crearComentario[0]).sort()).toEqual(["app_origen", "cuerpo", "hilo", "nombre", "respuesta_a"]);
    expect(JSON.stringify(llamadas)).not.toContain("203.0.113.7");
    expect(JSON.stringify(llamadas)).not.toContain("Mozilla");
  });

  it("el campo trampa lleno responde «todo bien» pero no verifica, ni gasta cupo, ni guarda nada", async () => {
    const { manejar, db, verificarTurnstile } = montar();
    const r = await manejar(post("comentarios", { ...comentario, sitio_web: "http://spam.example" }));
    expect(r.status).toBe(201);
    expect(verificarTurnstile).not.toHaveBeenCalled();
    expect(db.tomarCupo).not.toHaveBeenCalled();
    expect(db.crearComentario).not.toHaveBeenCalled();
  });

  it("rechaza sin guardar cuando Turnstile no valida el token", async () => {
    const { manejar, db } = montar({ turnstile: false });
    const r = await manejar(post("comentarios", comentario));
    expect(r.status).toBe(403);
    expect((await lee(r)).error).toBe("verificacion_fallida");
    expect(db.crearComentario).not.toHaveBeenCalled();
  });

  it("acepta 5 envíos al día por origen y rechaza el sexto con 429", async () => {
    const { manejar, llamadas } = montar({ cupos: 5 });
    const estados: number[] = [];
    for (let i = 0; i < 6; i++) estados.push((await manejar(post("comentarios", comentario))).status);
    expect(estados).toEqual([201, 201, 201, 201, 201, 429]);
    expect(llamadas.crearComentario).toHaveLength(5);
  });

  it("la clave de cupo es un hash: no contiene la IP, y cambia con el tipo de envío y con el día", async () => {
    const { manejar, llamadas } = montar();
    await manejar(post("comentarios", comentario, { origin: ORIGEN, "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    await manejar(post("feedback", { app: "seguridad", ruta: "/", tipo: "idea", mensaje: "Una idea", turnstile: "t", sitio_web: "" }, { origin: ORIGEN, "x-forwarded-for": "203.0.113.7" }));
    const [claveComentario, claveFeedback] = llamadas.claves;
    expect(claveComentario).toMatch(/^[0-9a-f]{64}$/);
    expect(claveComentario).not.toContain("203");
    expect(claveComentario).not.toBe(claveFeedback);
    expect(await claveDeCupo(SAL, "2026-11-12", "203.0.113.7", "comentario")).toBe(claveComentario);
    expect(await claveDeCupo(SAL, "2026-11-13", "203.0.113.7", "comentario")).not.toBe(claveComentario);
  });

  it("valida los campos y responde 422 con un código, sin guardar", async () => {
    const { manejar, db } = montar();
    const casos: [Record<string, unknown>, string][] = [
      [{ hilo: "otro:x" }, "hilo_invalido"],
      [{ hilo: "app:CON-MAYUS" }, "hilo_invalido"],
      [{ app: "malicioso" }, "app_invalida"],
      [{ nombre: "A" }, "nombre_invalido"],
      [{ nombre: "Ana\nPerez" }, "nombre_invalido"],
      [{ nombre: "visite http://spam.com" }, "nombre_invalido"],
      [{ cuerpo: "ab" }, "comentario_invalido"],
      [{ cuerpo: "x".repeat(2001) }, "comentario_invalido"],
      [{ cuerpo: "http://a.com http://b.com http://c.com" }, "demasiados_enlaces"],
      [{ respuesta_a: "no-es-uuid" }, "respuesta_invalida"],
      [{ turnstile: "" }, "verificacion_requerida"],
    ];
    for (const [cambio, codigo] of casos) {
      const r = await manejar(post("comentarios", { ...comentario, ...cambio }));
      expect(r.status, codigo).toBe(422);
      expect((await lee(r)).error).toBe(codigo);
    }
    expect(db.crearComentario).not.toHaveBeenCalled();
  });

  it("solo se puede responder a un comentario aprobado del mismo hilo", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const aprobado = montar({ aprobados: [id] });
    expect((await aprobado.manejar(post("comentarios", { ...comentario, respuesta_a: id }))).status).toBe(201);
    expect(aprobado.llamadas.crearComentario[0].respuesta_a).toBe(id);
    const otro = montar({ aprobados: [] });
    const r = await otro.manejar(post("comentarios", { ...comentario, respuesta_a: id }));
    expect(r.status).toBe(422);
    expect((await lee(r)).error).toBe("respuesta_invalida");
  });

  it("limpia caracteres de control y de inversión de texto; deja el HTML como texto (el cliente lo escapa)", async () => {
    const { manejar, llamadas } = montar();
    await manejar(post("comentarios", { ...comentario, nombre: "  Ana‮  ", cuerpo: "Hola\u0000 <b>mundo</b>​\n\n\n\nfin" }));
    expect(llamadas.crearComentario[0].nombre).toBe("Ana");
    expect(llamadas.crearComentario[0].cuerpo).toBe("Hola <b>mundo</b>\n\nfin");
  });

  it("rechaza cuerpos enormes (413) y JSON roto (400)", async () => {
    const { manejar } = montar();
    expect((await manejar(post("comentarios", "x".repeat(9000)))).status).toBe(413);
    expect((await manejar(post("comentarios", "{no es json"))).status).toBe(400);
  });

  it("si la base falla, responde 500 sin revelar el detalle", async () => {
    const { manejar, db } = montar();
    (db.crearComentario as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('relation "dcc_comentarios" does not exist'));
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await manejar(post("comentarios", comentario));
    espia.mockRestore();
    expect(r.status).toBe(500);
    const texto = await r.text();
    expect(JSON.parse(texto)).toEqual({ error: "error_interno" });
    expect(texto).not.toContain("dcc_comentarios");
  });
});

describe("POST /feedback", () => {
  const feedback = { app: "seguridad", ruta: "/seguridad", tipo: "idea", mensaje: "Me gustaría comparar dos municipios", turnstile: "t", sitio_web: "" };

  it("guarda el feedback sin contacto", async () => {
    const { manejar, llamadas } = montar();
    const r = await manejar(post("feedback", feedback));
    expect(r.status).toBe(201);
    expect(llamadas.crearFeedback).toEqual([{ app: "seguridad", ruta: "/seguridad", tipo: "idea", mensaje: "Me gustaría comparar dos municipios", contacto: null, consentimiento: false }]);
  });

  it("solo acepta un contacto si hay consentimiento expreso", async () => {
    const { manejar, db } = montar();
    const sin = await manejar(post("feedback", { ...feedback, contacto: "ana@ejemplo.com", consentimiento: false }));
    expect(sin.status).toBe(422);
    expect((await lee(sin)).error).toBe("consentimiento_requerido");
    expect(db.crearFeedback).not.toHaveBeenCalled();
    const con = await manejar(post("feedback", { ...feedback, contacto: "ana@ejemplo.com", consentimiento: true }));
    expect(con.status).toBe(201);
    expect((db.crearFeedback as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ contacto: "ana@ejemplo.com", consentimiento: true });
  });

  it("valida tipo, ruta y mensaje", async () => {
    const { manejar } = montar();
    for (const [cambio, codigo] of [[{ tipo: "insulto" }, "tipo_invalido"], [{ ruta: "sin-barra" }, "ruta_invalida"], [{ ruta: "/con espacio" }, "ruta_invalida"], [{ mensaje: "ab" }, "mensaje_invalido"]] as [Record<string, unknown>, string][]) {
      const r = await manejar(post("feedback", { ...feedback, ...cambio }));
      expect(r.status, codigo).toBe(422);
      expect((await lee(r)).error).toBe(codigo);
    }
  });

  it("el campo trampa y Turnstile funcionan igual que en los comentarios", async () => {
    const trampa = montar();
    expect((await trampa.manejar(post("feedback", { ...feedback, sitio_web: "x" }))).status).toBe(201);
    expect(trampa.db.crearFeedback).not.toHaveBeenCalled();
    const sinTurnstile = montar({ turnstile: false });
    expect((await sinTurnstile.manejar(post("feedback", feedback))).status).toBe(403);
    expect(sinTurnstile.db.crearFeedback).not.toHaveBeenCalled();
  });
});

describe("POST /eventos", () => {
  const lote = { app: "seguridad", eventos: [{ evento: "filtro_delito", propiedad: "homicidio", n: 2 }, { evento: "clic_mapa", propiedad: "", n: 1 }] };

  it("suma un lote válido y responde 204, sin Turnstile", async () => {
    const { manejar, llamadas, verificarTurnstile } = montar();
    const r = await manejar(post("eventos", lote));
    expect(r.status).toBe(204);
    expect(llamadas.sumarEventos).toEqual([{ app: "seguridad", eventos: lote.eventos }]);
    expect(verificarTurnstile).not.toHaveBeenCalled();
  });

  it("rechaza apps, eventos y propiedades que no están en la lista blanca", async () => {
    const { manejar, db } = montar();
    const malos = [
      { app: "otra", eventos: lote.eventos },
      { app: "seguridad", eventos: [{ evento: "borrar_todo", propiedad: "", n: 1 }] },
      { app: "seguridad", eventos: [{ evento: "filtro_delito", propiedad: "texto libre con espacios", n: 1 }] },
      { app: "seguridad", eventos: [{ evento: "filtro_delito", propiedad: "robo_de_gallinas", n: 1 }] },
      { app: "seguridad", eventos: [{ evento: "clic_mapa", propiedad: "algo", n: 1 }] },
      { app: "seguridad", eventos: [{ evento: "filtro_departamento", propiedad: "5", n: 1 }] },
      { app: "seguridad", eventos: [{ evento: "clic_mapa", propiedad: "", n: 0 }] },
      { app: "seguridad", eventos: [{ evento: "clic_mapa", propiedad: "", n: 1001 }] },
      { app: "seguridad", eventos: [{ evento: "clic_mapa", propiedad: "", n: 1.5 }] },
      { app: "seguridad", eventos: [] },
      { app: "seguridad" },
    ];
    for (const m of malos) expect((await manejar(post("eventos", m))).status, JSON.stringify(m)).toBe(400);
    expect(db.sumarEventos).not.toHaveBeenCalled();
  });

  it("acepta hasta 50 pares y rechaza 51", async () => {
    const { manejar } = montar();
    const par = (i: number) => ({ evento: "filtro_departamento", propiedad: String(i).padStart(2, "0"), n: 1 });
    expect((await manejar(post("eventos", { app: "seguridad", eventos: Array.from({ length: 50 }, (_, i) => par(i)) }))).status).toBe(204);
    expect((await manejar(post("eventos", { app: "seguridad", eventos: Array.from({ length: 51 }, (_, i) => par(i)) }))).status).toBe(400);
  });

  it("validarEventos acepta los eventos reservados de artículos y formularios", () => {
    const r = validarEventos({ app: "portal", eventos: [{ evento: "abrir_articulo", propiedad: "mi-primer-articulo", n: 1 }, { evento: "feedback_enviado", propiedad: "idea", n: 1 }, { evento: "comentario_enviado", n: 1 }] });
    expect(r.ok).toBe(true);
  });
});

describe("GET", () => {
  const filas: ComentarioPublico[] = Array.from({ length: 5 }, (_, i) => ({ id: `id-${i}`, nombre: `N${i}`, cuerpo: `Comentario ${i}`, respuesta_a: null, creado: `2026-11-1${i}T10:00:00Z` }));

  it("lista los comentarios aprobados de un hilo, con caché de 60 s y paginación", async () => {
    const { manejar, db } = montar({ comentarios: filas });
    const r = await manejar(get("comentarios?hilo=app:seguridad&limite=3"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("max-age=60");
    expect(r.headers.get("access-control-allow-origin")).toBe(ORIGEN);
    const j = await lee(r);
    expect(j.comentarios).toHaveLength(3);
    expect(j.hay_mas).toBe(true);
    expect((db.listarComentarios as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(["app:seguridad", 4, null]);
    expect(Object.keys(j.comentarios[0]).sort()).toEqual(["creado", "cuerpo", "id", "nombre", "respuesta_a"]);
  });

  it("acota el límite y rechaza hilos o cursores inválidos", async () => {
    const { manejar, db } = montar({ comentarios: filas });
    await manejar(get("comentarios?hilo=app:seguridad&limite=9999"));
    expect((db.listarComentarios as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(51);
    expect((await manejar(get("comentarios?hilo=cualquiera"))).status).toBe(400);
    expect((await manejar(get("comentarios?hilo=app:seguridad&antes=ayer"))).status).toBe(400);
  });

  it("cuenta comentarios por hilo, con cero para los que no tienen", async () => {
    const { manejar } = montar();
    const r = await manejar(get("conteos?hilos=articulo:uno,articulo:dos"));
    expect(await lee(r)).toEqual({ conteos: { "articulo:uno": 3, "articulo:dos": 0 } });
    expect((await manejar(get("conteos?hilos=malo"))).status).toBe(400);
  });

  it("responde salud sin caché y 404 para rutas desconocidas", async () => {
    const { manejar } = montar();
    const s = await manejar(get("salud"));
    expect(s.status).toBe(200);
    expect(s.headers.get("cache-control")).toBe("no-store");
    expect((await manejar(get("otra-cosa"))).status).toBe(404);
  });
});

describe("utilidades", () => {
  it("el día se cuenta en hora de Colombia", () => {
    expect(diaColombia(new Date("2026-11-13T03:30:00Z"))).toBe("2026-11-12");
    expect(diaColombia(new Date("2026-11-13T05:30:00Z"))).toBe("2026-11-13");
  });

  it("toma la IP de cf-connecting-ip o del primer valor de x-forwarded-for", () => {
    expect(ipDe(new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(ipDe(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(ipDe(new Headers())).toBe("desconocida");
  });

  it("limpiarTexto respeta los límites de longitud", () => {
    expect(limpiarTexto("ab", 3, 10)).toBeNull();
    expect(limpiarTexto("abc", 3, 10)).toBe("abc");
    expect(limpiarTexto("x".repeat(11), 3, 10)).toBeNull();
    expect(limpiarTexto(42, 1, 10)).toBeNull();
  });
});
