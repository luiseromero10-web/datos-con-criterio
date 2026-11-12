import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearRastreador, debeInyectarVisitas, pidioNoRastrear, type Carga, type MotivoDescarte } from "./rastreador";

function montar(opciones: { activo?: boolean; maxLotes?: number; maxPares?: number } = {}) {
  const enviados: { carga: Carga; lote: number }[] = [];
  const descartes: { motivo: MotivoDescarte; evento: string }[] = [];
  const estado = { activo: opciones.activo ?? true };
  const r = crearRastreador({
    app: "seguridad",
    activo: () => estado.activo,
    enviar: (carga, lote) => enviados.push({ carga, lote }),
    alDescartar: (motivo, evento) => descartes.push({ motivo, evento }),
    maxLotes: opciones.maxLotes,
    maxPares: opciones.maxPares,
  });
  return { r, enviados, descartes, estado };
}

describe("rastreador de eventos", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("no envía nada hasta que pasan 10 s y entonces manda un solo lote con el nombre y la propiedad", () => {
    const { r, enviados } = montar();
    r.track("filtro_delito", "hurto_vehiculos");
    expect(enviados).toHaveLength(0);
    vi.advanceTimersByTime(9_999);
    expect(enviados).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].carga).toEqual({ app: "seguridad", eventos: [{ evento: "filtro_delito", propiedad: "hurto_vehiculos", n: 1 }] });
  });

  it("agrupa los repetidos en un solo par con su conteo", () => {
    const { r, enviados } = montar();
    r.track("clic_mapa");
    r.track("clic_mapa");
    r.track("clic_mapa");
    r.track("filtro_periodo", "ult12");
    r.vaciar();
    expect(enviados[0].carga.eventos).toEqual([
      { evento: "clic_mapa", propiedad: "", n: 3 },
      { evento: "filtro_periodo", propiedad: "ult12", n: 1 },
    ]);
  });

  it("vaciar() envía de inmediato (salida de la página) y cancela el temporizador", () => {
    const { r, enviados } = montar();
    r.track("ver_metodologia");
    r.vaciar();
    expect(enviados).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    expect(enviados).toHaveLength(1);
  });

  it("sin eventos no hay lote ni temporizador", () => {
    const { r, enviados } = montar();
    r.vaciar();
    vi.advanceTimersByTime(60_000);
    expect(enviados).toHaveLength(0);
  });

  it("no envía datos personales: el payload solo tiene app y la lista de eventos, sin identificador ni IP ni hora", () => {
    const { r, enviados } = montar();
    r.track("filtro_departamento", "05");
    r.vaciar();
    const carga = enviados[0].carga as Record<string, unknown>;
    expect(Object.keys(carga).sort()).toEqual(["app", "eventos"]);
    for (const e of carga.eventos as Record<string, unknown>[]) expect(Object.keys(e).sort()).toEqual(["evento", "n", "propiedad"]);
  });

  it("rechaza texto libre, espacios, mayúsculas y nombres largos", () => {
    const { r, enviados, descartes } = montar();
    r.track("Filtro Delito", "x");
    r.track("filtro_delito", "mi nombre es Ana");
    r.track("filtro_delito", "correo@ejemplo.com");
    r.track("a".repeat(41));
    r.track("filtro_delito", "x".repeat(41));
    r.vaciar();
    expect(enviados).toHaveLength(0);
    expect(descartes).toHaveLength(5);
    expect(descartes.every((d) => d.motivo === "nombre_invalido")).toBe(true);
  });

  it("es un no-op cuando está apagado o el visitante pidió no ser rastreado", () => {
    const { r, enviados, descartes, estado } = montar({ activo: false });
    r.track("clic_mapa");
    r.vaciar();
    vi.advanceTimersByTime(60_000);
    expect(enviados).toHaveLength(0);
    expect(descartes).toEqual([{ motivo: "inactivo", evento: "clic_mapa" }]);
    estado.activo = true;
    r.track("clic_mapa");
    r.vaciar();
    expect(enviados).toHaveLength(1);
  });

  it("envía como máximo 3 lotes por carga de página y descarta el resto", () => {
    const { r, enviados, descartes } = montar();
    for (let i = 0; i < 6; i++) {
      r.track("clic_mapa");
      r.vaciar();
    }
    expect(enviados.map((e) => e.lote)).toEqual([1, 2, 3]);
    expect(descartes.filter((d) => d.motivo === "limite_de_lotes")).toHaveLength(3);
  });

  it("cierra el lote al llegar a 50 pares distintos, sin esperar el temporizador", () => {
    const { r, enviados } = montar();
    for (let i = 0; i < 49; i++) r.track("filtro_municipio", `m${i}`);
    expect(enviados).toHaveLength(0);
    r.track("filtro_municipio", "m49");
    expect(enviados).toHaveLength(1);
    expect(enviados[0].carga.eventos).toHaveLength(50);
  });

  it("trackUnaVez cuenta un evento una sola vez por carga", () => {
    const { r, enviados } = montar();
    r.trackUnaVez("vista_app");
    r.trackUnaVez("vista_app");
    r.trackUnaVez("vista_app");
    r.vaciar();
    expect(enviados[0].carga.eventos).toEqual([{ evento: "vista_app", propiedad: "", n: 1 }]);
  });
});

describe("«no rastrear» y visitas", () => {
  it("detecta DNT y el Control Global de Privacidad", () => {
    expect(pidioNoRastrear({ doNotTrack: "1" })).toBe(true);
    expect(pidioNoRastrear({ doNotTrack: null }, { doNotTrack: "1" })).toBe(true);
    expect(pidioNoRastrear({ globalPrivacyControl: true })).toBe(true);
    expect(pidioNoRastrear({ doNotTrack: "0" })).toBe(false);
    expect(pidioNoRastrear(undefined, undefined)).toBe(false);
  });

  it("el beacon de visitas solo se inyecta en producción, con identificador y sin «no rastrear»", () => {
    expect(debeInyectarVisitas({ token: "abc", produccion: true, noRastrear: false })).toBe(true);
    expect(debeInyectarVisitas({ token: "", produccion: true, noRastrear: false })).toBe(false);
    expect(debeInyectarVisitas({ token: "abc", produccion: false, noRastrear: false })).toBe(false);
    expect(debeInyectarVisitas({ token: "abc", produccion: true, noRastrear: true })).toBe(false);
  });
});
