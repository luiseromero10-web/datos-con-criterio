"use client";
/** Consultas SQL sobre el gold (DuckDB-WASM leyendo parquet de R2). Las entradas se validan: nada que venga de la dirección o del teclado llega a la consulta sin pasar por aquí. */
import { interpretar, paraLike } from "./buscar";
import { consultar, DATA_URL } from "./duck";
import { dimensionAlerta } from "./sectores";
import type { AlertaSector, AnioEmpresa, Catalogos, CuantilesSector, Empresa, Ficha, Metadatos, NivelSector, ResumenSector, Valores } from "./tipos";

export const INDICADORES = [
  "margen_bruto", "margen_operacional", "margen_neto", "roa", "roe", "razon_corriente", "prueba_acida", "endeudamiento", "apalancamiento",
  "cobertura_intereses", "dias_cartera", "dias_inventario", "dias_proveedores", "ciclo_caja", "crecimiento_real_ingresos", "flujo_operacion_ingresos",
] as const;
export const SENALES = [
  "patrimonio_negativo", "perdidas_consecutivas", "razon_corriente_menor_1", "cobertura_menor_1", "caida_ingresos_30", "opinion_no_limpia", "estado_distinto_activa",
] as const;
const ESTADOS = [
  "ingresos", "ganancia_bruta", "ganancia_operacional", "ganancia_neta", "activo_total", "activo_corriente", "pasivo_total", "pasivo_corriente", "patrimonio",
  "flujo_operacion", "efectivo", "costo_ventas",
] as const;
const REALES = ["ingresos_real", "ganancia_neta_real", "activo_total_real", "patrimonio_real"] as const;

const dbl = (cols: readonly string[]) => cols.map((c) => `${c}::DOUBLE AS ${c}`).join(", ");

/** NIT: solo enteros positivos de hasta 12 dígitos. */
export function nitSeguro(valor: string | number): number | null {
  const s = String(valor).trim();
  return /^\d{4,12}$/.test(s) ? Number(s) : null;
}

const CODIGO = /^([A-U]|\d{2}|\d{4})$/;
export const codigoSeguro = (c: string): string | null => (CODIGO.test(c) ? c : null);

// ---------------------------------------------------------------- datos de apoyo (JSON)
const cache = new Map<string, Promise<unknown>>();
function json<T>(nombre: string): Promise<T> {
  if (!cache.has(nombre)) {
    const p = fetch(`${DATA_URL}/${nombre}.json`).then((r) => {
      if (!r.ok) throw new Error(`No se pudo leer ${nombre}.json (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(nombre)); // permite reintentar
    cache.set(nombre, p);
  }
  return cache.get(nombre) as Promise<T>;
}
export const leerCatalogos = () => json<Catalogos>("catalogos");
export const leerMetadatos = () => json<Metadatos>("metadatos");
export const leerMetricasAlerta = () => json<Record<string, unknown>>("alerta_metricas");

// ---------------------------------------------------------------- buscador
export type Resultado = { nit: number; razon_social: string; ciiu_codigo: string | null; ciiu_descripcion: string | null; municipio: string | null; departamento: string | null; ultimo_anio: number };

export async function buscarEmpresas(entrada: string, limite = 10): Promise<Resultado[]> {
  const q = interpretar(entrada);
  const cols = `nit::DOUBLE AS nit, razon_social, ciiu_codigo, ciiu_descripcion, municipio, departamento, ultimo_anio::INTEGER AS ultimo_anio`;
  if (q.tipo === "vacia") return [];
  if (q.tipo === "nit") {
    const n = paraLike(q.nit);
    return consultar<Resultado>(
      `SELECT ${cols} FROM 'empresas.parquet' WHERE CAST(nit AS VARCHAR) LIKE '${n}%' ORDER BY (CAST(nit AS VARCHAR) = '${n}') DESC, nit LIMIT ${limite}`,
    );
  }
  const fichas = paraLike(q.texto).split(" ").filter(Boolean);
  const nombre = "strip_accents(lower(razon_social))";
  const donde = fichas.map((t) => `${nombre} LIKE '%${t}%'`).join(" AND ");
  return consultar<Resultado>(
    `SELECT ${cols} FROM 'empresas.parquet' WHERE ${donde}
     ORDER BY (${nombre} LIKE '${paraLike(q.texto)}%') DESC, ultimo_anio DESC, length(razon_social) LIMIT ${limite}`,
  );
}

// ---------------------------------------------------------------- ficha de una sociedad
type Fila = Record<string, unknown>;
const orden = (xs: Fila[]) => new Map(xs.map((x) => [Number(x.anio), x]));

function valores(f: Fila | undefined, cols: readonly string[]): Valores {
  const v: Valores = {};
  for (const c of cols) v[c] = f && f[c] !== null && f[c] !== undefined ? Number(f[c]) : null;
  return v;
}

export async function cargarFicha(nitEntrada: string | number): Promise<Ficha | null> {
  const nit = nitSeguro(nitEntrada);
  if (nit === null) return null;
  const donde = `WHERE nit = ${nit} ORDER BY anio`;
  const [emp, ea, est, ind, par, sen] = await Promise.all([
    consultar<Fila>(`SELECT nit::DOUBLE AS nit, razon_social, ciiu_codigo, ciiu_division, ciiu_descripcion, municipio, departamento, ultimo_anio::INTEGER AS ultimo_anio, primer_anio::INTEGER AS primer_anio, anios_reportados::INTEGER AS anios_reportados FROM 'empresas.parquet' WHERE nit = ${nit}`),
    consultar<Fila>(`SELECT anio::INTEGER AS anio, grupo, tipo_estado, razon_social, ciiu_codigo, ciiu_division, ciiu_descripcion, ciiu_origen, tipo_societario, CAST(fecha_constitucion AS VARCHAR) AS fecha_constitucion, estado_actual, opinion_revisor, municipio, departamento FROM 'empresas_anio.parquet' ${donde}`),
    consultar<Fila>(`SELECT anio::INTEGER AS anio, ${dbl(ESTADOS)} FROM 'estados.parquet' ${donde}`),
    consultar<Fila>(`SELECT anio::INTEGER AS anio, ${dbl(INDICADORES)}, ${INDICADORES.map((i) => `${i}_motivo`).join(", ")}, ${dbl(REALES)}, atipico_unidades FROM 'indicadores.parquet' ${donde}`),
    consultar<Fila>(`SELECT anio::INTEGER AS anio, grupo_pares, nivel_pares, codigo_pares, tercil::INTEGER AS tercil, n_pares::INTEGER AS n_pares, ${INDICADORES.map((i) => `pct_${i}::INTEGER AS pct_${i}`).join(", ")} FROM 'pares.parquet' ${donde}`),
    consultar<Fila>(`SELECT anio::INTEGER AS anio, ${SENALES.join(", ")}, n_senales::INTEGER AS n_senales FROM 'senales.parquet' ${donde}`),
  ]);
  if (emp.length === 0) return null;
  const mE = orden(est), mI = orden(ind), mP = orden(par), mS = orden(sen);
  const anios: AnioEmpresa[] = ea.map((a) => {
    const n = Number(a.anio);
    const i = mI.get(n), p = mP.get(n), s = mS.get(n), e = mE.get(n);
    const pct: Valores = {};
    for (const id of INDICADORES) pct[id] = p && p[`pct_${id}`] !== null && p[`pct_${id}`] !== undefined ? Number(p[`pct_${id}`]) : null;
    const senales: Record<string, boolean | null> = {};
    for (const id of SENALES) senales[id] = s && s[id] !== null && s[id] !== undefined ? Boolean(s[id]) : null;
    const motivo: Record<string, string | null> = {};
    for (const id of INDICADORES) motivo[id] = (i?.[`${id}_motivo`] as string | null | undefined) ?? null;
    return {
      anio: n,
      grupo: a.grupo as AnioEmpresa["grupo"],
      tipo_estado: a.tipo_estado as AnioEmpresa["tipo_estado"],
      razon_social: String(a.razon_social ?? ""),
      ciiu_codigo: (a.ciiu_codigo as string | null) ?? null,
      ciiu_division: (a.ciiu_division as string | null) ?? null,
      ciiu_descripcion: (a.ciiu_descripcion as string | null) ?? null,
      ciiu_origen: (a.ciiu_origen as string | null) ?? null,
      tipo_societario: (a.tipo_societario as string | null) ?? null,
      fecha_constitucion: (a.fecha_constitucion as string | null) ?? null,
      estado_actual: (a.estado_actual as string | null) ?? null,
      opinion_revisor: (a.opinion_revisor as string | null) ?? null,
      municipio: (a.municipio as string | null) ?? null,
      departamento: (a.departamento as string | null) ?? null,
      estados: valores(e, ESTADOS),
      reales: valores(i, REALES),
      ind: valores(i, INDICADORES),
      motivo,
      pct,
      senales,
      n_senales: s ? Number(s.n_senales ?? 0) : 0,
      atipico_unidades: Boolean(i?.atipico_unidades),
      par: {
        grupo: (p?.grupo_pares as string | null) ?? null,
        nivel: String(p?.nivel_pares ?? "ninguno"),
        codigo: (p?.codigo_pares as string | null) ?? null,
        tercil: p?.tercil === null || p?.tercil === undefined ? null : Number(p.tercil),
        n: p?.n_pares === null || p?.n_pares === undefined ? null : Number(p.n_pares),
      },
    };
  });
  const e = emp[0];
  const empresa: Empresa = {
    nit: Number(e.nit), razon_social: String(e.razon_social), ciiu_codigo: (e.ciiu_codigo as string | null) ?? null, ciiu_division: (e.ciiu_division as string | null) ?? null,
    ciiu_descripcion: (e.ciiu_descripcion as string | null) ?? null, municipio: (e.municipio as string | null) ?? null, departamento: (e.departamento as string | null) ?? null,
    ultimo_anio: Number(e.ultimo_anio), primer_anio: Number(e.primer_anio), anios_reportados: Number(e.anios_reportados),
  };
  return { empresa, anios };
}

// ---------------------------------------------------------------- sectores
export type HijoSector = { codigo: string; nombre: string; n_empresas: number; ingresos_total_real: number; crecimiento_real_panel: number | null; pct_perdida_neta: number | null };
export type OpcionSector = { nivel: NivelSector; codigo: string; nombre: string; n_empresas: number };

export async function listarSectores(): Promise<OpcionSector[]> {
  return consultar<OpcionSector>(
    `SELECT nivel, codigo, nombre, n_empresas::DOUBLE AS n_empresas FROM 'sector_resumen.parquet'
     WHERE nivel IN ('seccion', 'ciiu2') AND anio = (SELECT max(anio) FROM 'sector_resumen.parquet') ORDER BY nivel, codigo`,
  );
}

export type DatosSector = {
  resumen: ResumenSector[];
  cuantiles: CuantilesSector[];
  alerta: AlertaSector[];
  alertaNacional: AlertaSector[];
  hijos: HijoSector[];
  nombreAlerta: string | null;
};

export async function cargarSector(nivel: NivelSector, codigoEntrada: string): Promise<DatosSector | null> {
  const codigo = codigoSeguro(codigoEntrada);
  if (!codigo) return null;
  const dim = dimensionAlerta(nivel);
  const codigoAlerta = nivel === "ciiu4" ? codigo.slice(0, 2) : codigo;
  const colsAlerta = `anio::INTEGER AS anio, muestra, n_empresas::DOUBLE AS n_empresas, p_media::DOUBLE AS p_media, pct_perfil_alto::DOUBLE AS pct_perfil_alto, tasa_observada::DOUBLE AS tasa_observada, n_eventos::DOUBLE AS n_eventos`;
  const hijosSql =
    nivel === "seccion"
      ? `SELECT r.codigo, r.nombre, r.n_empresas::DOUBLE AS n_empresas, r.ingresos_total_real::DOUBLE AS ingresos_total_real, r.crecimiento_real_panel::DOUBLE AS crecimiento_real_panel, r.pct_perdida_neta::DOUBLE AS pct_perdida_neta
         FROM 'sector_resumen.parquet' r JOIN 'ciiu.parquet' c ON c.nivel = 'division' AND c.codigo = r.codigo
         WHERE r.nivel = 'ciiu2' AND c.seccion = '${codigo}' AND r.anio = (SELECT max(anio) FROM 'sector_resumen.parquet') ORDER BY r.codigo`
      : nivel === "ciiu2"
        ? `SELECT codigo, nombre, n_empresas::DOUBLE AS n_empresas, ingresos_total_real::DOUBLE AS ingresos_total_real, crecimiento_real_panel::DOUBLE AS crecimiento_real_panel, pct_perdida_neta::DOUBLE AS pct_perdida_neta
           FROM 'sector_resumen.parquet' WHERE nivel = 'ciiu4' AND codigo LIKE '${codigo}%' AND anio = (SELECT max(anio) FROM 'sector_resumen.parquet') ORDER BY n_empresas DESC`
        : null;
  const [resumen, cuantiles, alerta, alertaNacional, hijos, nombreAlerta] = await Promise.all([
    consultar<ResumenSector>(
      `SELECT anio::INTEGER AS anio, n_empresas::DOUBLE AS n_empresas, ingresos_total_real::DOUBLE AS ingresos_total_real, activo_total::DOUBLE AS activo_total,
              pct_perdida_neta::DOUBLE AS pct_perdida_neta, pct_patrimonio_negativo::DOUBLE AS pct_patrimonio_negativo, pct_crece_rentable::DOUBLE AS pct_crece_rentable,
              crecimiento_real_panel::DOUBLE AS crecimiento_real_panel, nombre FROM 'sector_resumen.parquet' WHERE nivel = '${nivel}' AND codigo = '${codigo}' ORDER BY anio`,
    ),
    consultar<CuantilesSector>(
      `SELECT anio::INTEGER AS anio, indicador, n::DOUBLE AS n, p05::DOUBLE AS p05, p25::DOUBLE AS p25, p50::DOUBLE AS p50, p75::DOUBLE AS p75, p95::DOUBLE AS p95
       FROM 'sector_anio.parquet' WHERE nivel = '${nivel}' AND codigo = '${codigo}' ORDER BY anio`,
    ),
    consultar<AlertaSector>(`SELECT ${colsAlerta} FROM 'alerta_agregada.parquet' WHERE dimension = '${dim}' AND codigo = '${codigoAlerta}' ORDER BY anio`),
    consultar<AlertaSector>(`SELECT ${colsAlerta} FROM 'alerta_agregada.parquet' WHERE dimension = 'total' ORDER BY anio`),
    hijosSql ? consultar<HijoSector>(hijosSql) : Promise.resolve([] as HijoSector[]),
    consultar<{ nombre: string }>(
      `SELECT nombre FROM 'ciiu.parquet' WHERE nivel = '${dim === "seccion" ? "seccion" : "division"}' AND codigo = '${codigoAlerta}' LIMIT 1`,
    ),
  ]);
  if (resumen.length === 0) return null;
  return { resumen, cuantiles, alerta, alertaNacional, hijos, nombreAlerta: nombreAlerta[0]?.nombre ?? null };
}

// ---------------------------------------------------------------- mediana del sector de una sociedad
export type MedianaSector = { n: number; p25: number; p50: number; p75: number; nivel: NivelSector; codigo: string };

/** Mediana y rango intercuartílico de cada indicador en el sector de la sociedad: su clase CIIU si tiene 15 sociedades o más, si no su división. */
export async function medianasSector(ciiu: string | null, anio: number): Promise<Map<string, MedianaSector>> {
  const salida = new Map<string, MedianaSector>();
  const c4 = ciiu && /^\d{4}$/.test(ciiu) ? ciiu : null;
  if (!c4 || !Number.isInteger(anio)) return salida;
  const filas = await consultar<{ nivel: NivelSector; codigo: string; indicador: string; n: number; p25: number; p50: number; p75: number }>(
    `SELECT nivel, codigo, indicador, n::DOUBLE AS n, p25::DOUBLE AS p25, p50::DOUBLE AS p50, p75::DOUBLE AS p75 FROM 'sector_anio.parquet'
     WHERE anio = ${anio} AND ((nivel = 'ciiu4' AND codigo = '${c4}') OR (nivel = 'ciiu2' AND codigo = '${c4.slice(0, 2)}'))`,
  );
  for (const f of filas.sort((a, b) => (a.nivel === "ciiu4" ? -1 : 1) - (b.nivel === "ciiu4" ? -1 : 1))) {
    if (!salida.has(f.indicador)) salida.set(f.indicador, { n: f.n, p25: f.p25, p50: f.p50, p75: f.p75, nivel: f.nivel, codigo: f.codigo });
  }
  return salida;
}
