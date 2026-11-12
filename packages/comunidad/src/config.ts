/**
 * Configuración por variables de entorno públicas (Next las incorpora al compilar, también dentro de paquetes transpilados).
 *
 *  NEXT_PUBLIC_APP_ID          id de la app que emite los eventos («seguridad», «portal»…); lo fija cada next.config.ts
 *  NEXT_PUBLIC_EVENTOS_URL     URL de la función de eventos (P3). Vacía = no se envía nada
 *  NEXT_PUBLIC_EVENTOS=off     interruptor de apagado: silencia todo sin tocar el código
 *  NEXT_PUBLIC_CF_BEACON_TOKEN identificador público de Cloudflare Web Analytics (visitas)
 */
export const APP = process.env.NEXT_PUBLIC_APP_ID ?? "desconocida";
export const URL_EVENTOS = process.env.NEXT_PUBLIC_EVENTOS_URL ?? "";
export const APAGADO = process.env.NEXT_PUBLIC_EVENTOS === "off";
export const TOKEN_VISITAS = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN ?? "";
export const ES_PRODUCCION = process.env.NODE_ENV === "production";
