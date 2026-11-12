"use client";
import { useEffect } from "react";
import { ES_PRODUCCION, TOKEN_VISITAS } from "./config";
import { debeInyectarVisitas } from "./rastreador";
import { respetaNoRastrear } from "./track";

/**
 * Conteo de visitas con Cloudflare Web Analytics: sin cookies ni almacenamiento local para rastrear y sin identificar por IP
 * (según el artículo oficial de Cloudflare). Solo en producción, con identificador y si el visitante no pidió «no rastrear».
 */
export default function AnaliticaVisitas() {
  useEffect(() => {
    if (!debeInyectarVisitas({ token: TOKEN_VISITAS, produccion: ES_PRODUCCION, noRastrear: respetaNoRastrear() })) return;
    if (document.querySelector("script[data-cf-beacon]")) return;
    const s = document.createElement("script");
    s.defer = true;
    s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: TOKEN_VISITAS }));
    document.head.appendChild(s);
  }, []);
  return null;
}
