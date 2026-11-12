export const DELITOS = [
  { id: "homicidio", nombre: "Homicidio" },
  { id: "lesiones", nombre: "Lesiones personales" },
  { id: "hurto_personas", nombre: "Hurto a personas" },
  { id: "hurto_comercio", nombre: "Hurto a comercio" },
  { id: "hurto_residencias", nombre: "Hurto a residencias" },
  { id: "hurto_vehiculos", nombre: "Hurto de vehículos" },
] as const;

export type DelitoId = (typeof DELITOS)[number]["id"];
export const nombreDelito = (id: string) => DELITOS.find((d) => d.id === id)?.nombre ?? id;
