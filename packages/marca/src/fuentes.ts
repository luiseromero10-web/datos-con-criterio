import { Archivo, Martian_Mono } from "next/font/google";

// Archivo (Omnibus-Type, Argentina): variable en ancho y peso; titulares expandidos, texto normal.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });
// Martian Mono: etiquetas técnicas y cifras pequeñas.
const martian = Martian_Mono({ variable: "--font-martian", subsets: ["latin"], display: "swap" });

/** Clases para la etiqueta <html>: exponen --font-archivo y --font-martian a los estilos de la marca. */
export const clasesFuentes = `${archivo.variable} ${martian.variable}`;
