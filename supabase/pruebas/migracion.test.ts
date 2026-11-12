import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SQL = readFileSync(new URL("../migrations/20261112000000_dcc_comunidad.sql", import.meta.url), "utf8");
const TABLAS = ["dcc_comentarios", "dcc_feedback", "dcc_eventos_dia", "dcc_limites"];
const FUNCIONES = ["dcc_sumar_eventos", "dcc_tomar_cupo", "dcc_contar_comentarios"];

let db: PGlite;

/** Como ROMI: roles y privilegios por defecto de Supabase, y un objeto ajeno que la migración no debe tocar. */
async function prepararBase() {
  const base = new PGlite();
  await base.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

    create table public.productos (id int primary key, nombre text);
    insert into public.productos values (1, 'intacto');
    alter table public.productos enable row level security;
    create policy lectura_publica on public.productos for select to anon using (true);
  `);
  await base.exec(SQL);
  return base;
}

/** Ejecuta una consulta con otro rol (como lo haría la API) y vuelve al rol de administración. */
async function como<T>(rol: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`set role ${rol}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = await prepararBase();
});
afterAll(async () => {
  await db.close();
});

describe("alcance de la migración", () => {
  it("solo crea y modifica objetos con prefijo dcc_ y nunca borra nada", () => {
    const sinComentarios = SQL.replace(/--.*$/gm, "");
    expect(sinComentarios).not.toMatch(/\b(drop|truncate)\b/i);
    expect(sinComentarios).not.toMatch(/delete\s+from\s+public\.(?!dcc_)/i);
    const nombres = [
      ...sinComentarios.matchAll(/create\s+(?:unique\s+)?(?:table|index|function|policy)\s+(?:public\.)?(\w+)/gi),
      ...sinComentarios.matchAll(/alter\s+table\s+public\.(\w+)/gi),
      ...sinComentarios.matchAll(/\bon\s+(?:table\s+|function\s+)?public\.(\w+)/gi),
      ...sinComentarios.matchAll(/references\s+public\.(\w+)/gi),
    ].map((m) => m[1]);
    expect(nombres.length).toBeGreaterThan(10);
    const ajenos = nombres.filter((n) => !n.startsWith("dcc_"));
    expect(ajenos).toEqual([]);
  });

  it("deja intacto un objeto ajeno: mismos datos, misma RLS y ninguna política nueva", async () => {
    const filas = await db.query<{ nombre: string }>("select nombre from public.productos");
    expect(filas.rows).toEqual([{ nombre: "intacto" }]);
    const rls = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname = 'productos'");
    expect(rls.rows[0].relrowsecurity).toBe(true);
    const pol = await db.query<{ policyname: string }>("select policyname from pg_policies where tablename = 'productos'");
    expect(pol.rows).toEqual([{ policyname: "lectura_publica" }]);
  });

  it("lo único nuevo en public es dcc_ (4 tablas y 3 funciones)", async () => {
    const t = await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by 1");
    expect(t.rows.map((r) => r.tablename)).toEqual([...TABLAS, "productos"].sort());
    const f = await db.query<{ proname: string }>(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1",
    );
    expect(f.rows.map((r) => r.proname)).toEqual([...FUNCIONES].sort());
  });
});

describe("seguridad: cerrado para el público", () => {
  it("las 4 tablas tienen RLS activado y exactamente una política de negación", async () => {
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname like 'dcc\\_%' and relkind = 'r' order by 1",
    );
    expect(rls.rows.map((r) => r.relname)).toEqual([...TABLAS].sort());
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true);
    const pol = await db.query<{ tablename: string; n: string }>(
      "select tablename, count(*)::text as n from pg_policies where tablename like 'dcc\\_%' group by 1 order by 1",
    );
    expect(pol.rows.map((r) => r.n)).toEqual(["1", "1", "1", "1"]);
  });

  for (const rol of ["anon", "authenticated"]) {
    it(`${rol} no puede leer ni escribir en ninguna tabla dcc_`, async () => {
      for (const t of TABLAS) {
        await expect(como(rol, `select * from public.${t} limit 1`)).rejects.toThrow(/permission denied/i);
        await expect(como(rol, `delete from public.${t}`)).rejects.toThrow(/permission denied/i);
      }
      await expect(como(rol, "insert into public.dcc_comentarios (hilo, nombre, cuerpo, app_origen) values ('app:x', 'Ana', 'hola', 'x')")).rejects.toThrow(/permission denied/i);
      await expect(como(rol, "insert into public.dcc_feedback (app, ruta, tipo, mensaje) values ('x', '/', 'idea', 'hola')")).rejects.toThrow(/permission denied/i);
    });

    it(`${rol} no puede ejecutar ninguna función dcc_`, async () => {
      await expect(como(rol, "select public.dcc_sumar_eventos('seguridad', '[]'::jsonb)")).rejects.toThrow(/permission denied/i);
      await expect(como(rol, "select public.dcc_tomar_cupo('abcdefgh', 5)")).rejects.toThrow(/permission denied/i);
      await expect(como(rol, "select * from public.dcc_contar_comentarios(array['app:x'])")).rejects.toThrow(/permission denied/i);
    });
  }

  it("ninguna función es SECURITY DEFINER y todas fijan search_path (evita avisos nuevos del analizador)", async () => {
    const f = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
      "select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'dcc\\_%'",
    );
    expect(f.rows).toHaveLength(3);
    for (const r of f.rows) {
      expect(r.prosecdef).toBe(false);
      expect((r.proconfig ?? []).some((c) => c.startsWith("search_path="))).toBe(true);
    }
  });

  it("solo service_role puede ejecutar las funciones (PUBLIC no)", async () => {
    const r = await db.query<{ proname: string; ejecuta_public: boolean; ejecuta_service: boolean }>(
      `select p.proname,
              has_function_privilege('public', p.oid, 'execute') as ejecuta_public,
              has_function_privilege('service_role', p.oid, 'execute') as ejecuta_service
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'dcc\\_%'`,
    );
    expect(r.rows.every((x) => !x.ejecuta_public && x.ejecuta_service)).toBe(true);
  });
});

describe("comentarios y feedback: reglas de los datos", () => {
  const ok = { hilo: "app:seguridad", nombre: "Ana", cuerpo: "Muy útil, gracias", app: "seguridad" };
  const insertar = (o: Partial<typeof ok> & { hilo?: string }) =>
    como("service_role", "insert into public.dcc_comentarios (hilo, nombre, cuerpo, app_origen) values ($1, $2, $3, $4) returning id, estado", [
      o.hilo ?? ok.hilo, o.nombre ?? ok.nombre, o.cuerpo ?? ok.cuerpo, o.app ?? ok.app,
    ]);

  it("service_role guarda un comentario y queda pendiente por defecto", async () => {
    const [fila] = await insertar({});
    expect((fila as { estado: string }).estado).toBe("pendiente");
  });

  it("rechaza hilos mal formados, nombres cortos y cuerpos vacíos o enormes", async () => {
    await expect(insertar({ hilo: "otro:x" })).rejects.toThrow(/check/i);
    await expect(insertar({ hilo: "app:Con Espacios" })).rejects.toThrow(/check/i);
    await expect(insertar({ nombre: "A" })).rejects.toThrow(/check/i);
    await expect(insertar({ cuerpo: "ab" })).rejects.toThrow(/check/i);
    await expect(insertar({ cuerpo: "x".repeat(2001) })).rejects.toThrow(/check/i);
  });

  it("rechaza un estado inválido", async () => {
    await expect(como("service_role", "update public.dcc_comentarios set estado = 'publicado'")).rejects.toThrow(/check/i);
  });

  it("borrar un comentario borra sus respuestas (cascada)", async () => {
    const [padre] = (await insertar({ cuerpo: "Comentario padre" })) as { id: string }[];
    await como("service_role", "insert into public.dcc_comentarios (hilo, nombre, cuerpo, app_origen, respuesta_a) values ($1, 'Luis', 'Respuesta', 'seguridad', $2)", [ok.hilo, padre.id]);
    const antes = await como<{ n: string }>("service_role", "select count(*)::text as n from public.dcc_comentarios where respuesta_a = $1", [padre.id]);
    expect(antes[0].n).toBe("1");
    await como("service_role", "delete from public.dcc_comentarios where id = $1", [padre.id]);
    const despues = await como<{ n: string }>("service_role", "select count(*)::text as n from public.dcc_comentarios where respuesta_a = $1", [padre.id]);
    expect(despues[0].n).toBe("0");
  });

  it("el feedback solo guarda un contacto si hay consentimiento", async () => {
    const ins = (contacto: string | null, consentimiento: boolean) =>
      como("service_role", "insert into public.dcc_feedback (app, ruta, tipo, mensaje, contacto, consentimiento) values ('seguridad', '/', 'idea', 'Me gustaría ver más', $1, $2)", [contacto, consentimiento]);
    await expect(ins("ana@ejemplo.com", false)).rejects.toThrow(/dcc_feedback_contacto_con_consentimiento/);
    await expect(ins("ana@ejemplo.com", true)).resolves.toBeDefined();
    await expect(ins(null, false)).resolves.toBeDefined();
  });

  it("el feedback rechaza tipos y rutas inválidos", async () => {
    const ins = (tipo: string, ruta: string) =>
      como("service_role", "insert into public.dcc_feedback (app, ruta, tipo, mensaje) values ('seguridad', $1, $2, 'mensaje válido')", [ruta, tipo]);
    await expect(ins("insulto", "/")).rejects.toThrow(/check/i);
    await expect(ins("idea", "sin-barra")).rejects.toThrow(/check/i);
    await expect(ins("idea", "/ruta con espacio")).rejects.toThrow(/check/i);
  });
});

describe("funciones", () => {
  it("dcc_sumar_eventos agrupa duplicados del mismo lote y acumula entre lotes", async () => {
    const lote = JSON.stringify([
      { evento: "clic_mapa", propiedad: "", n: 2 },
      { evento: "clic_mapa", propiedad: "", n: 3 },
      { evento: "filtro_delito", propiedad: "homicidio", n: 1 },
    ]);
    await como("service_role", "select public.dcc_sumar_eventos($1, $2::jsonb)", ["seguridad", lote]);
    await como("service_role", "select public.dcc_sumar_eventos($1, $2::jsonb)", ["seguridad", JSON.stringify([{ evento: "clic_mapa", propiedad: "", n: 4 }])]);
    const r = await como<{ evento: string; propiedad: string; conteo: string }>(
      "service_role",
      "select evento, propiedad, conteo::text from public.dcc_eventos_dia where app = 'seguridad' order by evento, propiedad",
    );
    expect(r).toEqual([
      { evento: "clic_mapa", propiedad: "", conteo: "9" },
      { evento: "filtro_delito", propiedad: "homicidio", conteo: "1" },
    ]);
  });

  it("dcc_sumar_eventos separa por app y rechaza nombres inválidos", async () => {
    await como("service_role", "select public.dcc_sumar_eventos('portal', $1::jsonb)", [JSON.stringify([{ evento: "vista_app", propiedad: "", n: 1 }])]);
    const r = await como<{ app: string }>("service_role", "select app from public.dcc_eventos_dia where evento = 'vista_app'");
    expect(r).toEqual([{ app: "portal" }]);
    await expect(
      como("service_role", "select public.dcc_sumar_eventos('portal', $1::jsonb)", [JSON.stringify([{ evento: "Con Espacios", propiedad: "", n: 1 }])]),
    ).rejects.toThrow(/check/i);
  });

  it("dcc_tomar_cupo permite hasta el máximo y luego niega; cada clave tiene su propio cupo", async () => {
    const tomar = async (clave: string) => (await como<{ ok: boolean }>("service_role", "select public.dcc_tomar_cupo($1, 3) as ok", [clave]))[0].ok;
    expect([await tomar("clave-aaaaaaaa"), await tomar("clave-aaaaaaaa"), await tomar("clave-aaaaaaaa"), await tomar("clave-aaaaaaaa")]).toEqual([true, true, true, false]);
    expect(await tomar("clave-bbbbbbbb")).toBe(true);
  });

  it("dcc_tomar_cupo limpia los días viejos", async () => {
    await db.exec("insert into public.dcc_limites (clave, dia, n) values ('clave-vieja-1', current_date - 10, 4)");
    await como("service_role", "select public.dcc_tomar_cupo('clave-ccccccc', 5)");
    const r = await db.query<{ n: string }>("select count(*)::text as n from public.dcc_limites where clave = 'clave-vieja-1'");
    expect(r.rows[0].n).toBe("0");
  });

  it("dcc_contar_comentarios cuenta solo los aprobados, por hilo", async () => {
    await db.exec(`
      insert into public.dcc_comentarios (hilo, nombre, cuerpo, app_origen, estado) values
        ('articulo:uno', 'A1', 'aprobado 1', 'portal', 'aprobado'),
        ('articulo:uno', 'A2', 'aprobado 2', 'portal', 'aprobado'),
        ('articulo:uno', 'A3', 'pendiente', 'portal', 'pendiente'),
        ('articulo:uno', 'A4', 'rechazado', 'portal', 'rechazado'),
        ('articulo:dos', 'B1', 'aprobado', 'portal', 'aprobado');
    `);
    const r = await como<{ hilo: string; n: string }>(
      "service_role",
      "select hilo, n::text as n from public.dcc_contar_comentarios(array['articulo:uno','articulo:dos','articulo:tres']) order by hilo",
    );
    expect(r).toEqual([{ hilo: "articulo:dos", n: "1" }, { hilo: "articulo:uno", n: "2" }]);
  });
});

describe("reversa", () => {
  it("el script de reversa deja la base como estaba antes y no toca lo ajeno", async () => {
    const reversa = readFileSync(new URL("../reversa/dcc_comunidad_bajar.sql", import.meta.url), "utf8");
    const sinComentarios = reversa.replace(/--.*$/gm, "");
    const nombres = [...sinComentarios.matchAll(/drop\s+(?:table|function)\s+if\s+exists\s+public\.(\w+)/gi)].map((m) => m[1]);
    expect(nombres.length).toBe(7);
    expect(nombres.every((n) => n.startsWith("dcc_"))).toBe(true);

    const base = await prepararBase();
    try {
      await base.exec("insert into public.dcc_comentarios (hilo, nombre, cuerpo, app_origen) values ('app:x', 'Ana', 'hola', 'x')");
      await base.exec(reversa);
      const t = await base.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by 1");
      expect(t.rows.map((r) => r.tablename)).toEqual(["productos"]);
      const f = await base.query("select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'");
      expect(f.rows).toHaveLength(0);
      const productos = await base.query<{ nombre: string }>("select nombre from public.productos");
      expect(productos.rows).toEqual([{ nombre: "intacto" }]);
      const pol = await base.query<{ policyname: string }>("select policyname from pg_policies where schemaname = 'public'");
      expect(pol.rows).toEqual([{ policyname: "lectura_publica" }]);
      // y se puede volver a aplicar la migración sin residuos
      await base.exec(SQL);
      const otra = await base.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by 1");
      expect(otra.rows).toHaveLength(5);
    } finally {
      await base.close();
    }
  });
});
