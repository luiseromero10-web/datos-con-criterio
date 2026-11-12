import { describe, expect, it } from "vitest";
import { entradaIndice, validarMeta, visibles, type ArticuloMeta } from "./articulo-meta";

const bueno = { titulo: "Un título válido", fecha: "2026-11-20", resumen: "Un resumen con suficiente largo.", apps: ["seguridad"], estado: "publicado" };

describe("validarMeta", () => {
  it("acepta un artículo correcto", () => {
    expect(validarMeta("mi-articulo", bueno)).toEqual({ slug: "mi-articulo", titulo: "Un título válido", fecha: "2026-11-20", resumen: "Un resumen con suficiente largo.", apps: ["seguridad"], estado: "publicado" });
  });
  it("normaliza la fecha que YAML entrega como Date", () => {
    expect(validarMeta("a", { ...bueno, fecha: new Date("2026-11-20T00:00:00Z") }).fecha).toBe("2026-11-20");
  });
  it("apps ausente equivale a ninguna, y se quitan repetidas", () => {
    const sin: Record<string, unknown> = { ...bueno };
    delete sin.apps;
    expect(validarMeta("a", sin).apps).toEqual([]);
    expect(validarMeta("a", { ...bueno, apps: ["seguridad", "seguridad"] }).apps).toEqual(["seguridad"]);
  });
  it.each([
    ["sin datos", undefined],
    ["lista en vez de objeto", []],
    ["título corto", { ...bueno, titulo: "ab" }],
    ["título que no es texto", { ...bueno, titulo: 5 }],
    ["resumen corto", { ...bueno, resumen: "corto" }],
    ["fecha inexistente", { ...bueno, fecha: "2026-02-31" }],
    ["fecha en otro formato", { ...bueno, fecha: "20/11/2026" }],
    ["estado desconocido", { ...bueno, estado: "listo" }],
    ["estado ausente", { ...bueno, estado: undefined }],
    ["app desconocida", { ...bueno, apps: ["secop"] }],
    ["apps que no es lista", { ...bueno, apps: "seguridad" }],
  ])("rechaza: %s", (_n, meta) => {
    expect(() => validarMeta("a", meta)).toThrow(/Artículo «a»/);
  });
  it.each(["Mayúsculas", "con espacio", "-empieza", "termina-", "doble--guion", "x".repeat(41), ""])("rechaza el nombre de archivo %j", (slug) => {
    expect(() => validarMeta(slug, bueno)).toThrow(/identificador/);
  });
});

const meta = (slug: string, fecha: string, estado: ArticuloMeta["estado"]): ArticuloMeta => ({ slug, titulo: slug, fecha, resumen: "x".repeat(12), apps: [], estado });

describe("visibles", () => {
  const todos = [meta("b", "2026-01-01", "publicado"), meta("c", "2026-03-01", "borrador"), meta("a", "2026-03-01", "publicado")];
  it("en producción oculta los borradores", () => {
    expect(visibles(todos, false).map((x) => x.slug)).toEqual(["a", "b"]);
  });
  it("con borradores los incluye; más recientes primero y desempate por nombre", () => {
    expect(visibles(todos, true).map((x) => x.slug)).toEqual(["a", "c", "b"]);
  });
  it("no modifica la lista original", () => {
    const copia = [...todos];
    visibles(todos, true);
    expect(todos).toEqual(copia);
  });
});

describe("entradaIndice", () => {
  it("no expone el estado ni nada fuera de lo necesario", () => {
    expect(Object.keys(entradaIndice(meta("a", "2026-01-01", "publicado"))).sort()).toEqual(["apps", "fecha", "resumen", "slug", "titulo"]);
  });
});
