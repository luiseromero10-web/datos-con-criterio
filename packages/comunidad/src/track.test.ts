import { afterEach, describe, expect, it, vi } from "vitest";

const URL_FUNCION = "https://ejemplo.supabase.co/functions/v1/dcc-comunidad/eventos";

/** Carga track.ts de nuevo con el entorno indicado: la configuración se lee al importar, igual que al compilar la app. */
async function cargar(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("./track");
}

function navegador(extra: Record<string, unknown> = {}) {
  const sendBeacon = vi.fn(() => false);
  vi.stubGlobal("navigator", { doNotTrack: null, sendBeacon, ...extra });
  return { sendBeacon };
}

function fetchFalso() {
  const f = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("modo según el entorno", () => {
  it("desarrollo = simulación; producción sin URL = inactivo; producción con URL = real; apagado manda sobre todo", async () => {
    expect((await cargar({ NODE_ENV: "development" })).modo()).toBe("simulacion");
    expect((await cargar({ NODE_ENV: "production", NEXT_PUBLIC_EVENTOS_URL: "" })).modo()).toBe("inactivo");
    expect((await cargar({ NODE_ENV: "production", NEXT_PUBLIC_EVENTOS_URL: URL_FUNCION })).modo()).toBe("real");
    expect((await cargar({ NODE_ENV: "production", NEXT_PUBLIC_EVENTOS_URL: URL_FUNCION, NEXT_PUBLIC_EVENTOS: "off" })).modo()).toBe("apagado");
    expect((await cargar({ NODE_ENV: "development", NEXT_PUBLIC_EVENTOS: "off" })).modo()).toBe("apagado");
  });
});

describe("transporte en modo real (con fetch simulado)", () => {
  it("envía un POST con el lote agrupado, sin datos personales", async () => {
    const f = fetchFalso();
    navegador();
    const m = await cargar({ NODE_ENV: "production", NEXT_PUBLIC_APP_ID: "seguridad", NEXT_PUBLIC_EVENTOS_URL: URL_FUNCION });
    m.track("filtro_delito", "homicidio");
    m.track("filtro_delito", "homicidio");
    m.track("clic_mapa");
    m.vaciarYa();

    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_FUNCION);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>)["Content-Type"]).toContain("text/plain");
    const cuerpo = JSON.parse(init.body as string);
    expect(cuerpo).toEqual({
      app: "seguridad",
      eventos: [
        { evento: "filtro_delito", propiedad: "homicidio", n: 2 },
        { evento: "clic_mapa", propiedad: "", n: 1 },
      ],
    });
    expect(Object.keys(cuerpo).sort()).toEqual(["app", "eventos"]);
  });

  it("usa sendBeacon cuando está disponible y no recurre a fetch", async () => {
    const f = fetchFalso();
    const { sendBeacon } = navegador({ sendBeacon: vi.fn(() => true) });
    const m = await cargar({ NODE_ENV: "production", NEXT_PUBLIC_APP_ID: "portal", NEXT_PUBLIC_EVENTOS_URL: URL_FUNCION });
    m.track("vista_app");
    m.vaciarYa();
    const baliza = (globalThis.navigator as unknown as { sendBeacon: typeof sendBeacon }).sendBeacon as unknown as ReturnType<typeof vi.fn>;
    expect(baliza).toHaveBeenCalledTimes(1);
    expect(baliza.mock.calls[0][0]).toBe(URL_FUNCION);
    expect(baliza.mock.calls[0][1]).toBeInstanceOf(Blob);
    expect(f).not.toHaveBeenCalled();
  });

  it("si fetch falla, la analítica no rompe la app", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("sin red"))));
    navegador();
    const m = await cargar({ NODE_ENV: "production", NEXT_PUBLIC_APP_ID: "seguridad", NEXT_PUBLIC_EVENTOS_URL: URL_FUNCION });
    m.track("clic_mapa");
    expect(() => m.vaciarYa()).not.toThrow();
  });
});

describe("cuando NO debe enviar nada", () => {
  it("con el interruptor NEXT_PUBLIC_EVENTOS=off, aunque haya URL", async () => {
    const f = fetchFalso();
    const { sendBeacon } = navegador();
    const m = await cargar({ NODE_ENV: "production", NEXT_PUBLIC_EVENTOS_URL: URL_FUNCION, NEXT_PUBLIC_EVENTOS: "off" });
    m.track("clic_mapa");
    m.vaciarYa();
    expect(f).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("si el visitante pidió «no rastrear» (DNT)", async () => {
    const f = fetchFalso();
    navegador({ doNotTrack: "1" });
    const m = await cargar({ NODE_ENV: "production", NEXT_PUBLIC_EVENTOS_URL: URL_FUNCION });
    m.track("clic_mapa");
    m.vaciarYa();
    expect(f).not.toHaveBeenCalled();
  });

  it("si activó el Control Global de Privacidad", async () => {
    const f = fetchFalso();
    navegador({ globalPrivacyControl: true });
    const m = await cargar({ NODE_ENV: "production", NEXT_PUBLIC_EVENTOS_URL: URL_FUNCION });
    m.track("clic_mapa");
    m.vaciarYa();
    expect(f).not.toHaveBeenCalled();
  });

  it("en producción sin URL configurada (modo inactivo)", async () => {
    const f = fetchFalso();
    navegador();
    const m = await cargar({ NODE_ENV: "production", NEXT_PUBLIC_EVENTOS_URL: "" });
    m.track("clic_mapa");
    m.vaciarYa();
    expect(f).not.toHaveBeenCalled();
  });

  it("en desarrollo nunca sale del equipo, aunque la URL esté configurada (solo simulación)", async () => {
    const f = fetchFalso();
    const { sendBeacon } = navegador();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const m = await cargar({ NODE_ENV: "development", NEXT_PUBLIC_EVENTOS_URL: URL_FUNCION });
    m.track("clic_mapa");
    m.vaciarYa();
    expect(f).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });
});
