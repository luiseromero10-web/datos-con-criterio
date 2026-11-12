/** Rampa secuencial azul del mapa (6 tonos) y colores de los contornos de puntos calientes. */
export const RAMPA_CLARA = ["#eef4fb", "#c6dbf2", "#8db8e6", "#4f8fd6", "#2459b8", "#0b2a6b"] as const;
// En oscuro la rampa se ilumina hacia los valores altos.
export const RAMPA_OSCURA = ["#0d1b2e", "#163a66", "#22589c", "#3a7fd0", "#79b0f0", "#cfe4ff"] as const;

/** Contornos de puntos calientes: halo (marino u oscuro, ver --map-casing) y línea de color encima. */
export const COLOR_CONTORNO = { persistente: "#ffffff", emergente: "#f59e0b", en_disminucion: "#ffffff" } as const;
/** Grosor de la línea de cada categoría (px). */
export const ANCHO_CONTORNO = { persistente: 2.4, emergente: 2.6, en_disminucion: 1.2 } as const;
/** Selección de un municipio. */
export const COLOR_SELECCION = "#22d3ee";
