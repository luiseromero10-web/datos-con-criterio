import type { Unidad } from "./format";

export type { Unidad };

/** Definición de un indicador (viene de gold/catalogos.json: una sola fuente para la ficha, la comparación y la metodología). */
export type DefIndicador = { id: string; nombre: string; unidad: Unidad; formula: string; sentido: -1 | 0 | 1; nota: string };
export type DefSenal = { id: string; texto: string };

export type Catalogos = {
  indicadores: DefIndicador[];
  motivos: Record<string, string>;
  senales: DefSenal[];
  pares: { minimo_por_tercil: number; minimo_para_terciles: number; minimo_para_percentil: number; niveles: Record<string, string> };
  pesos_constantes: { anio_base: number; flujos: string; saldos: string; fuente: string; ipc: { anio: number; ipc_dic: number; ipc_prom: number; variacion_diciembre: number | null }[] };
};

export type Metadatos = {
  generado: string;
  anios: number[];
  filas: Record<string, number>;
  fuentes: Record<string, { id: string; actualizado: number | null }>;
  licencia: string;
  atribucion: string;
  aviso: string;
  calidad: Record<string, number | null>;
};

export type Empresa = {
  nit: number;
  razon_social: string;
  ciiu_codigo: string | null;
  ciiu_division: string | null;
  ciiu_descripcion: string | null;
  municipio: string | null;
  departamento: string | null;
  ultimo_anio: number;
  primer_anio: number;
  anios_reportados: number;
};

export type Valores = Record<string, number | null>;

/** Todo lo que se sabe de una sociedad en un año de cierre. */
export type AnioEmpresa = {
  anio: number;
  grupo: "G1" | "G2";
  tipo_estado: "individual" | "separado";
  razon_social: string;
  ciiu_codigo: string | null;
  ciiu_division: string | null;
  ciiu_descripcion: string | null;
  ciiu_origen: string | null;
  tipo_societario: string | null;
  fecha_constitucion: string | null;
  estado_actual: string | null;
  opinion_revisor: string | null;
  municipio: string | null;
  departamento: string | null;
  estados: Valores; // en pesos corrientes
  reales: Valores; // en pesos constantes del último año
  ind: Valores; // los 16 indicadores
  motivo: Record<string, string | null>;
  pct: Valores; // percentil de desempeño frente a los pares, 0–100
  senales: Record<string, boolean | null>;
  n_senales: number;
  atipico_unidades: boolean;
  par: { grupo: string | null; nivel: string; codigo: string | null; tercil: number | null; n: number | null };
};

export type Ficha = { empresa: Empresa; anios: AnioEmpresa[] };

export type NivelSector = "seccion" | "ciiu2" | "ciiu4";

export type ResumenSector = {
  anio: number;
  n_empresas: number;
  ingresos_total_real: number;
  activo_total: number;
  pct_perdida_neta: number | null;
  pct_patrimonio_negativo: number | null;
  pct_crece_rentable: number | null;
  crecimiento_real_panel: number | null;
  nombre: string;
};

export type CuantilesSector = { anio: number; indicador: string; n: number; p05: number; p25: number; p50: number; p75: number; p95: number };

export type AlertaSector = {
  anio: number;
  muestra: "entrenamiento" | "validacion" | "prueba" | "sin_etiqueta";
  n_empresas: number;
  p_media: number;
  pct_perfil_alto: number;
  tasa_observada: number | null;
  n_eventos: number | null;
};
