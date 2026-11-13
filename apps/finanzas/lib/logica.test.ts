import { describe, expect, it } from "vitest";
import { interpretar, normalizar, paraLike } from "./buscar";
import { codigoSeguro, nitSeguro } from "./consultas";
import { decimal, entero, nombrePropio, pesos, porcentaje, valorIndicador } from "./format";
import { ejesComunes, ejesDe } from "./perfil";
import { dimensionAlerta, nivelDeCodigo } from "./sectores";
import { fraseComparacion, lecturaPercentil } from "./texto";
import type { AnioEmpresa, Catalogos, DefIndicador } from "./tipos";

describe("formato colombiano", () => {
  it("separa miles con punto y decimales con coma", () => {
    expect(entero(1234567)).toBe("1.234.567");
    expect(decimal(12.34)).toBe("12,3");
    expect(porcentaje(0.1234)).toBe("12,3 %");
    expect(porcentaje(-0.05)).toBe("−5,0 %");
  });
  it("usa la escala en palabras de Colombia (mil millones, billones)", () => {
    expect(pesos(1.3e12)).toBe("$ 1,3 billón");
    expect(pesos(2.5e12)).toBe("$ 2,5 billones");
    expect(pesos(345e9)).toBe("$ 345 mil millones");
    expect(pesos(12.34e9)).toBe("$ 12,3 mil millones");
    expect(pesos(12.3e6)).toBe("$ 12,3 millones");
    expect(pesos(4500)).toBe("$ 4.500");
    expect(pesos(-2e9)).toBe("−$ 2,0 mil millones");
    expect(pesos(null)).toBe("–");
  });
  it("muestra cada indicador en su unidad y no revienta con valores absurdos de la fuente", () => {
    expect(valorIndicador("fraccion", 0.081)).toBe("8,1 %");
    expect(valorIndicador("veces", 1.8723)).toBe("1,87");
    expect(valorIndicador("dias", 217.62)).toBe("218 días");
    expect(valorIndicador("fraccion", null)).toBe("–");
    expect(valorIndicador("fraccion", 3.1e8)).toBe("3,1e+10 %"); // 3,1·10⁸ como fracción son 3,1·10¹⁰ por ciento: notación compacta, sin cadenas de dígitos
    expect(valorIndicador("dias", 2.8e10)).toMatch(/mil días/);
  });
  it("escribe la razón social con mayúsculas legibles y respeta lo que ya viene bien", () => {
    expect(nombrePropio("INVERSIONES Y MATERIALES PETREOS S.A.S.")).toBe("Inversiones y Materiales Petreos S.A.S.");
    expect(nombrePropio("Bavaria & Cia S.C.A")).toBe("Bavaria & Cia S.C.A");
    expect(nombrePropio("")).toBe("");
  });
});

describe("buscador", () => {
  it("normaliza tildes y signos", () => {
    expect(normalizar("  Inversiones  Péñaloza, S.A.S. ")).toBe("inversiones penaloza s a s");
  });
  it("distingue NIT, texto y entradas demasiado cortas", () => {
    expect(interpretar("860005224")).toEqual({ tipo: "nit", nit: "860005224" });
    expect(interpretar("860.005.224")).toEqual({ tipo: "nit", nit: "860005224" });
    expect(interpretar("860.005.224-7")).toEqual({ tipo: "nit", nit: "860005224" }); // el dígito de verificación no hace parte del NIT guardado
    expect(interpretar("bavaria")).toEqual({ tipo: "texto", texto: "bavaria" });
    expect(interpretar("ba").tipo).toBe("vacia");
    expect(interpretar("123").tipo).toBe("vacia");
    expect(interpretar("   ").tipo).toBe("vacia");
  });
  it("no deja pasar comodines ni comillas a la consulta", () => {
    expect(paraLike("o'brien%_x\\")).toBe("obrienx");
    expect(nitSeguro("860005224")).toBe(860005224);
    for (const malo of ["1; DROP TABLE x", "12", "abc", "86000'5224", "1".repeat(13), ""]) expect(nitSeguro(malo)).toBeNull();
    expect(codigoSeguro("G")).toBe("G");
    expect(codigoSeguro("47")).toBe("47");
    expect(codigoSeguro("4711")).toBe("4711");
    for (const malo of ["Z", "471", "47'; --", "g", "", "47 11"]) expect(codigoSeguro(malo)).toBeNull();
  });
});

describe("sectores", () => {
  it("el código define el nivel", () => {
    expect(nivelDeCodigo("G")).toBe("seccion");
    expect(nivelDeCodigo("47")).toBe("ciiu2");
    expect(nivelDeCodigo("4711")).toBe("ciiu4");
    for (const malo of ["", "gg", "471", "V", "47a"]) expect(nivelDeCodigo(malo)).toBeNull();
    expect(dimensionAlerta("ciiu4")).toBe("ciiu2");
    expect(dimensionAlerta("seccion")).toBe("seccion");
  });
});

const DEFS: DefIndicador[] = [
  { id: "margen_neto", nombre: "Margen neto", unidad: "fraccion", formula: "", sentido: 1, nota: "" },
  { id: "endeudamiento", nombre: "Endeudamiento", unidad: "fraccion", formula: "", sentido: -1, nota: "" },
  { id: "dias_proveedores", nombre: "Días de proveedores", unidad: "dias", formula: "", sentido: 0, nota: "" },
  { id: "roa", nombre: "Rentabilidad del activo (ROA)", unidad: "fraccion", formula: "", sentido: 1, nota: "" },
];
const CAT = { indicadores: DEFS } as unknown as Catalogos;

function anio(ind: Record<string, number | null>, pct: Record<string, number | null>): AnioEmpresa {
  return { anio: 2024, ind, pct } as unknown as AnioEmpresa;
}

describe("comparación en palabras", () => {
  const a = { nombre: "Alfa", a: anio({ margen_neto: 0.08, endeudamiento: 0.7, dias_proveedores: 90, roa: 0.05 }, { margen_neto: 80, endeudamiento: 20, roa: 60 }) };
  const b = { nombre: "Beta", a: anio({ margen_neto: 0.03, endeudamiento: 0.4, dias_proveedores: 30, roa: 0.05 }, { margen_neto: 40, endeudamiento: 85, roa: 60 }) };
  it("sigue el sentido de cada indicador: menos endeudamiento es mejor", () => {
    const f = fraseComparacion(a, b, DEFS);
    expect(f[0]).toBe("Alfa está mejor en 1 de 2 indicadores comparables y Beta en 1.");
    expect(f.join(" ")).toContain("Alfa tiene mayor margen neto (8,0 % frente a 3,0 %).");
    expect(f.join(" ")).toContain("Beta tiene menor endeudamiento (40,0 % frente a 70,0 %).");
  });
  it("no compara lo neutral ni lo que es igual, y avisa si no hay nada comparable", () => {
    expect(fraseComparacion(a, b, DEFS).join(" ")).not.toMatch(/proveedores/i);
    expect(fraseComparacion(a, b, DEFS).join(" ")).not.toMatch(/rentabilidad/i);
    const vacio = { nombre: "Gamma", a: anio({}, {}) };
    expect(fraseComparacion(a, vacio, DEFS)[0]).toMatch(/No hay indicadores comparables/);
  });
  it("lee el percentil con palabras neutras", () => {
    expect(lecturaPercentil(72, 1)).toBe("Mejor que el 72 % de sus pares");
    expect(lecturaPercentil(30, 1)).toBe("Peor que el 70 % de sus pares");
    expect(lecturaPercentil(null, 1)).toBe("Sin pares suficientes");
    expect(lecturaPercentil(60, 0)).toBe("Por encima del 60 % de sus pares");
  });
});

describe("araña de indicadores", () => {
  it("solo dibuja los ejes con percentil y encuentra los comunes entre dos sociedades", () => {
    const x = ejesDe(anio({ margen_neto: 0.1, roa: 0.05, endeudamiento: 0.5 }, { margen_neto: 70, roa: null, endeudamiento: 40 }), CAT);
    expect(x.map((e) => e.id)).toEqual(["margen_neto", "endeudamiento"]);
    expect(x[0].real).toBe("10,0 %");
    const y = ejesDe(anio({ margen_neto: 0.02, roa: 0.01, endeudamiento: 0.9 }, { margen_neto: 20, roa: 30, endeudamiento: null }), CAT);
    expect(ejesComunes(x, y)).toEqual(["margen_neto"]);
    expect(ejesDe(undefined, CAT)).toEqual([]);
  });
});
