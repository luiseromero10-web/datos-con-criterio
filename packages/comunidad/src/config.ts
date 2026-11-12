/**
 * Configuración por variables de entorno públicas (Next las incorpora al compilar, también dentro de paquetes transpilados).
 *
 *  NEXT_PUBLIC_APP_ID             id de la app que emite los eventos («seguridad», «portal»…); lo fija cada next.config.ts
 *  NEXT_PUBLIC_EVENTOS_URL        URL de la ruta /eventos de la función dcc-comunidad. Vacía = no se envía nada
 *  NEXT_PUBLIC_EVENTOS=off        interruptor de apagado de los eventos
 *  NEXT_PUBLIC_COMUNIDAD_URL      URL base de la función dcc-comunidad (comentarios y feedback). Vacía en producción = desactivado
 *  NEXT_PUBLIC_COMUNIDAD=off      interruptor de apagado de comentarios y feedback
 *  NEXT_PUBLIC_TURNSTILE_SITEKEY  clave pública del widget de Cloudflare Turnstile
 *  NEXT_PUBLIC_CF_BEACON_TOKEN    identificador público de Cloudflare Web Analytics (visitas)
 */
export const APP = process.env.NEXT_PUBLIC_APP_ID ?? "desconocida";
export const URL_EVENTOS = process.env.NEXT_PUBLIC_EVENTOS_URL ?? "";
export const APAGADO = process.env.NEXT_PUBLIC_EVENTOS === "off";
export const URL_COMUNIDAD = (process.env.NEXT_PUBLIC_COMUNIDAD_URL ?? "").replace(/\/+$/, "");
export const COMUNIDAD_APAGADA = process.env.NEXT_PUBLIC_COMUNIDAD === "off";
export const SITEKEY_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? "";
export const TOKEN_VISITAS = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN ?? "";
export const ES_PRODUCCION = process.env.NODE_ENV === "production";
