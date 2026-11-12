import { describe, expect, it } from "vitest";
import { alturaExtrusion, cambioRelativo, datosClave, distanciaKm, fraseComparacion, ladoMayorM, percentil, perfilPorDelito, type EjePerfil } from "./perfil";

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

describe("distanciaKm", () => {
  it("calcula distancias razonables", () => {
    expect(distanciaKm([0, 0], [0, 0])).toBe(0);
    expect(distanciaKm([-74.08, 4.61], [-75.57, 6.25])).toBeGreaterThan(220); // Bogotá–Medellín ≈ 240 km
    expect(distanciaKm([-74.08, 4.61], [-75.57, 6.25])).toBeLessThan(260);
  });
});

const eje = (id: string, nombre: string, tasa: number, hechos = 100): EjePerfil => ({ id: id as EjePerfil["id"], nombre, tasa, hechos, valor: 50, real: "" });
describe("fraseComparacion", () => {
  const a = [eje("homicidio", "Homicidio", 10), eje("lesiones", "Lesiones personales", 100)];
  const b = [eje("homicidio", "Homicidio", 30), eje("lesiones", "Lesiones personales", 40)];
  it("dice quién tiene más tasa total y la excepción", () => {
    const f = fraseComparacion("A", "B", a, b);
    expect(f[0]).toBe("En conjunto, A tiene una tasa de denuncias 1,6 veces la de B.");
    expect(f[1]).toBe("La excepción es «Homicidio»: ahí B supera a A (3 veces).");
  });
  it("es simétrico: cambiar el orden cambia quién va primero", () => {
    expect(fraseComparacion("B", "A", b, a)[0]).toBe("En conjunto, A tiene una tasa de denuncias 1,6 veces la de B.");
  });
  it("sin excepción", () => {
    const c = [eje("homicidio", "Homicidio", 1), eje("lesiones", "Lesiones personales", 1)];
    expect(fraseComparacion("A", "B", a, c)[1]).toBe("A está por encima de B en todos los tipos de delito.");
  });
  it("maneja ceros", () => {
    const cero = [eje("homicidio", "Homicidio", 0, 0), eje("lesiones", "Lesiones personales", 0, 0)];
    expect(fraseComparacion("A", "B", cero, cero)).toEqual(["Ninguno de los dos municipios registra denuncias en el periodo."]);
    expect(fraseComparacion("A", "B", a, cero)[0]).toBe("A registra denuncias y B no registra ninguna.");
  });
  it("avisa cuando hay pocas denuncias", () => {
    expect(fraseComparacion("A", "B", a, [eje("homicidio", "Homicidio", 5, 3)]).at(-1)).toMatch(/inestable/);
  });
});
