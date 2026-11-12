export const DELITOS = [
  { id: "homicidio", nombre: "Homicidio" },
  { id: "lesiones", nombre: "Lesiones personales" },
  { id: "hurto_personas", nombre: "Hurto a personas" },
  { id: "hurto_comercio", nombre: "Hurto a comercio" },
  { id: "hurto_residencias", nombre: "Hurto a residencias" },
  { id: "hurto_vehiculos", nombre: "Hurto de vehículos" },
] as const;

export type DelitoId = (typeof DELITOS)[number]["id"];
/** Lo que elige la persona en el filtro: un delito, o la suma de todos. */
export type DelitoSel = DelitoId | "todos";
export const TODOS = "todos" as const;
export const nombreDelito = (id: string) => (id === TODOS ? "Todos los delitos" : (DELITOS.find((d) => d.id === id)?.nombre ?? id));
