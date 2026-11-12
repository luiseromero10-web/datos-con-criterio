import { describe, expect, it } from "vitest";
import { alturaExtrusion, cambioRelativo, datosClave, ladoMayorM, percentil, perfilPorDelito } from "./perfil";

const munis = [
  { cod_mpio: "05001", municipio: "A", cod_dpto: "05", departamento: "X", pob: 1000 },
  { cod_mpio: "05002", municipio: "B", cod_dpto: "05", departamento: "X", pob: 1000 },
  { cod_mpio: "05003", municipio: "C", cod_dpto: "05", departamento: "X", pob: 1000 },
  { cod_mpio: "05004", municipio: "Sin población", cod_dpto: "05", departamento: "X", pob: 0 },
];
const conteos = {
  homicidio: { "05001": 1, "05002": 5, "05003": 10 },
  lesiones: { "05001": 9, "05002": 0, "05003": 0 },
};

describe("percentil", () => {
  it("cuenta solo los estrictamente menores", () => {
    expect(percentil(5, [1, 5, 10, 10])).toBe(25);
    expect(percentil(0, [0, 0, 0, 7])).toBe(0);
  });
  it("sin datos o valor no finito da 0", () => {
    expect(percentil(3, [])).toBe(0);
    expect(percentil(NaN, [1, 2])).toBe(0);
  });
});

describe("cambioRelativo", () => {
  it("acota el rango y evita dividir por casi cero", () => {
    expect(cambioRelativo(1000, 1)).toBe(3);
    expect(cambioRelativo(0, 100)).toBe(-1);
    expect(cambioRelativo(10, 0)).toBe(2);
  });
});

describe("perfilPorDelito", () => {
  it("devuelve un eje por cada delito cargado, entre 0 y 100", () => {
    const p = perfilPorDelito("05002", munis, conteos)!;
    expect(p.map((e) => e.id)).toEqual(["homicidio", "lesiones"]);
    for (const e of p) {
      expect(e.valor).toBeGreaterThanOrEqual(0);
      expect(e.valor).toBeLessThanOrEqual(100);
    }
  });
  it("el municipio con más tasa en un delito queda arriba y el más bajo en cero", () => {
    expect(perfilPorDelito("05003", munis, conteos)!.find((e) => e.id === "homicidio")!.valor).toBeGreaterThan(50);
    expect(perfilPorDelito("05001", munis, conteos)!.find((e) => e.id === "homicidio")!.valor).toBe(0);
    expect(perfilPorDelito("05001", munis, conteos)!.find((e) => e.id === "lesiones")!.valor).toBeGreaterThan(50);
  });
  it("incluye el valor real en texto", () => {
    expect(perfilPorDelito("05002", munis, conteos)!.find((e) => e.id === "homicidio")!.real).toMatch(/^5 denuncias/);
  });
  it("sin población, inexistente o sin conteos cargados", () => {
    expect(perfilPorDelito("05004", munis, conteos)).toBeNull();
    expect(perfilPorDelito("99999", munis, conteos)).toBeNull();
    expect(perfilPorDelito("05001", munis, {})).toEqual([]);
  });
});

describe("datosClave", () => {
  const c = [{ cod_mpio: "05002", ult: 30, prev: 10, tasa: 5, z: 2, categoria: "emergente" }];
  it("resume variación y agrupación", () => {
    expect(datosClave("05002", c).map((x) => x.etiqueta)).toEqual(["Últimos 12 meses", "Variación", "Agrupación (Gi*)"]);
    expect(datosClave("05002", c)[1].valor).toMatch(/^\+200/);
  });
  it("sin fila no hay datos", () => {
    expect(datosClave("05001", c)).toEqual([]);
  });
});

describe("alturaExtrusion", () => {
  it("crece con el percentil y respeta los límites", () => {
    expect(alturaExtrusion(-5, 10000)).toBe(alturaExtrusion(0, 10000));
    expect(alturaExtrusion(100, 10000)).toBeCloseTo(6200);
    expect(alturaExtrusion(50, 10000)).toBeGreaterThan(alturaExtrusion(10, 10000));
  });
  it("es proporcional al tamaño y tiene un piso para municipios diminutos", () => {
    expect(alturaExtrusion(50, 40000)).toBeCloseTo(alturaExtrusion(50, 20000) * 2);
    expect(alturaExtrusion(0, 100)).toBeCloseTo(2000 * 0.12);
  });
});

describe("ladoMayorM", () => {
  it("mide en metros y toma el lado mayor", () => {
    expect(ladoMayorM([-75, 4, -74.9, 4.2])).toBeCloseTo(0.2 * 110574, -2);
  });
});
