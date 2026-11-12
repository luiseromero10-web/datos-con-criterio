import { afterEach, describe, expect, it, vi } from "vitest";

const URL_BASE = "https://ejemplo.supabase.co/functions/v1/dcc-comunidad";
const REAL = { NODE_ENV: "production", NEXT_PUBLIC_APP_ID: "seguridad", NEXT_PUBLIC_COMUNIDAD_URL: URL_BASE, NEXT_PUBLIC_TURNSTILE_SITEKEY: "0x4AAAAAAAclave" };

async function cargar(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("./api");
}

function fetchDevuelve(estado: number, cuerpo: unknown) {
  const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify(cuerpo), { status: estado })));
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const comentario = { hilo: "app:seguridad", nombre: "Ana", cuerpo: "Muy útil", turnstile: "tok", sitio_web: "" };

describe("modo de la comunidad", () => {
  it("desarrollo = simulación; producción necesita URL y clave de Turnstile; apagado manda sobre todo", async () => {
    expect((await cargar({ NODE_ENV: "development" })).modoComunidad()).toBe("simulacion");
    expect((await cargar({ ...REAL })).modoComunidad()).toBe("real");
    expect((await cargar({ ...REAL, NEXT_PUBLIC_COMUNIDAD_URL: "" })).modoComunidad()).toBe("inactivo");
    expect((await cargar({ ...REAL, NEXT_PUBLIC_TURNSTILE_SITEKEY: "" })).modoComunidad()).toBe("inactivo");
    expect((await cargar({ ...REAL, NEXT_PUBLIC_COMUNIDAD: "off" })).modoComunidad()).toBe("inactivo");
    expect((await cargar({ NODE_ENV: "development", NEXT_PUBLIC_COMUNIDAD: "off" })).modoComunidad()).toBe("inactivo");
  });
});

describe("simulación: nada sale del equipo", () => {
  it("lista comentarios de ejemplo y acepta envíos sin llamar a la red", async () => {
    const f = fetchDevuelve(201, {});
    const api = await cargar({ NODE_ENV: "development", NEXT_PUBLIC_COMUNIDAD_URL: URL_BASE });
    const lista = await api.listarComentarios("app:seguridad");
    expect(lista.ok && lista.comentarios.length).toBeGreaterThan(0);
    expect(await api.enviarComentario(comentario)).toEqual({ ok: true });
    expect(await api.enviarFeedback({ ruta: "/seguridad", tipo: "idea", mensaje: "hola", contacto: "", consentimiento: false, turnstile: "t", sitio_web: "" })).toEqual({ ok: true });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("inactivo: la app sigue funcionando", () => {
  it("no llama a la red y responde con un motivo claro", async () => {
    const f = fetchDevuelve(201, {});
    const api = await cargar({ NODE_ENV: "production", NEXT_PUBLIC_COMUNIDAD_URL: "" });
    expect(await api.listarComentarios("app:seguridad")).toEqual({ ok: false, motivo: "inactivo" });
    const r = await api.enviarComentario(comentario);
    expect(r.ok).toBe(false);
    expect(await api.contarComentarios(["app:seguridad"])).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("modo real (con fetch simulado)", () => {
  it("envía el comentario como text/plain con la app, sin datos extra", async () => {
    const f = fetchDevuelve(201, { ok: true, estado: "pendiente" });
    const api = await cargar(REAL);
    expect(await api.enviarComentario(comentario)).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL_BASE}/comentarios`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toContain("text/plain");
    expect(JSON.parse(init.body as string)).toEqual({ ...comentario, app: "seguridad" });
  });

  it("traduce los códigos de error de la función a mensajes para la persona", async () => {
    for (const [estado, codigo, texto] of [
      [403, "verificacion_fallida", /confirmar que es una persona/i],
      [429, "limite_diario", /mañana/i],
      [422, "demasiados_enlaces", /enlaces/i],
      [422, "nombre_invalido", /nombre/i],
      [500, "error_interno", /más tarde/i],
    ] as [number, string, RegExp][]) {
      fetchDevuelve(estado, { error: codigo });
      const r = await (await cargar(REAL)).enviarComentario(comentario);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.motivo).toBe(codigo);
        expect(r.mensaje).toMatch(texto);
      }
    }
  });

  it("si no hay red, devuelve un error controlado en lugar de lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const api = await cargar(REAL);
    const r = await api.enviarComentario(comentario);
    expect(r).toMatchObject({ ok: false, motivo: "red" });
    expect(await api.listarComentarios("app:seguridad")).toEqual({ ok: false, motivo: "red" });
    expect(await api.contarComentarios(["app:seguridad"])).toBeNull();
  });

  it("lista con el hilo codificado y el cursor de paginación", async () => {
    const f = fetchDevuelve(200, { comentarios: [{ id: "1", nombre: "Ana", cuerpo: "Hola", respuesta_a: null, creado: "2026-11-10T10:00:00Z" }], hay_mas: true });
    const api = await cargar(REAL);
    const r = await api.listarComentarios("app:seguridad", "2026-11-10T10:00:00Z");
    expect(r.ok && r.hayMas).toBe(true);
    const url = (f.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain(`${URL_BASE}/comentarios?`);
    expect(url).toContain("hilo=app%3Aseguridad");
    expect(url).toContain("antes=");
  });

  it("cuenta comentarios de varios hilos en una sola llamada", async () => {
    const f = fetchDevuelve(200, { conteos: { "articulo:uno": 3 } });
    const api = await cargar(REAL);
    expect(await api.contarComentarios(["articulo:uno", "articulo:dos"])).toEqual({ "articulo:uno": 3 });
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain("hilos=articulo%3Auno%2Carticulo%3Ados");
  });
});
