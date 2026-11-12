import { describe, expect, it } from "vitest";
import { leerIndice } from "./ArticulosRelacionados";

const ok = { slug: "uno", titulo: "Uno", fecha: "2026-11-20", resumen: "Resumen de uno.", apps: ["seguridad"] };

describe("leerIndice", () => {
  it("devuelve solo los artículos de la app pedida", () => {
    const otro = { ...ok, slug: "dos", apps: ["portal"] };
    expect(leerIndice({ articulos: [ok, otro] }, "seguridad").map((a) => a.slug)).toEqual(["uno"]);
  });
  it.each([
    ["sin cuerpo", null],
    ["texto", "hola"],
    ["sin lista", {}],
    ["lista que no es lista", { articulos: "x" }],
  ])("no falla con una respuesta rara: %s", (_n, json) => {
    expect(leerIndice(json, "seguridad")).toEqual([]);
  });
  it.each([
    ["slug con caracteres raros", { ...ok, slug: "../x" }],
    ["slug demasiado largo", { ...ok, slug: "a".repeat(41) }],
    ["sin título", { ...ok, titulo: undefined }],
    ["apps que no es lista", { ...ok, apps: "seguridad" }],
    ["entrada nula", null],
  ])("descarta la entrada: %s", (_n, e) => {
    expect(leerIndice({ articulos: [e, ok] }, "seguridad").map((a) => a.slug)).toEqual(["uno"]);
  });
  it("un slug con forma de ruta nunca llega a un enlace", () => {
    expect(leerIndice({ articulos: [{ ...ok, slug: "x/../../admin" }] }, "seguridad")).toEqual([]);
  });
});
