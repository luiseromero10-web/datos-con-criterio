/**
 * Prefijo de la zona (basePath). Next lo aplica solo a <Link>, a los recursos de /_next y a los archivos de public/ al servirlos,
 * pero NO a las URL que el código pide con fetch() ni a las que recibe MapLibre: esas se arman con ruta().
 */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const ruta = (camino: string) => `${BASE}${camino.startsWith("/") ? camino : `/${camino}`}`;
