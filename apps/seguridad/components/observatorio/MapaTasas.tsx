"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapaMl, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ANCHO_CONTORNO, COLOR_CONTORNO, COLOR_SELECCION, RAMPA_CLARA, RAMPA_OSCURA } from "@dcc/marca/mapa";
import { cssVar, useTema } from "@/lib/useTema";
import { ruta } from "@/lib/ruta";
import { decimal, entero } from "@/lib/format";
import type { Cambio, Muni } from "@/lib/datos";
import { TODOS, type DelitoSel } from "@/lib/delitos";
import { alturaExtrusion, datosClave, distanciaKm, ladoMayorM, percentil, perfilPorDelito, type ConteosPorDelito } from "@/lib/perfil";
import PerfilMunicipio from "./PerfilMunicipio";
import CompararMunicipios from "./CompararMunicipios";
import { COLOR_B } from "@/lib/colores";

type Props = {
  conteos: Record<string, number>;
  munis: Muni[];
  cambios: Cambio[];
  delito: DelitoSel;
  conteosPorDelito: ConteosPorDelito;
  seleccionado: string;
  /** segundo municipio del modo comparar ("" si no hay) */
  seleccionadoB: string;
  eligiendoB: boolean;
  onComparar: () => void;
  onCancelarComparar: () => void;
  onCerrarB: () => void;
  onSeleccion: (cod: string) => void;
  onCerrar: () => void;
  etiquetaPeriodo: string;
};

// Contornos de puntos calientes: halo (marino u oscuro) + línea encima, legible sobre cualquier tono de la rampa.
// Línea entre municipios: fina al ver todo el país y más gruesa al acercarse.
const ANCHO_BORDE = ["interpolate", ["linear"], ["zoom"], 3, 0.35, 5, 0.6, 7, 1, 10, 1.7];
const ANCHO_CAT = ["match", ["feature-state", "cat"], "persistente", ANCHO_CONTORNO.persistente, "emergente", ANCHO_CONTORNO.emergente, "en_disminucion", ANCHO_CONTORNO.en_disminucion, 0];
const COLOR_CAT = ["match", ["feature-state", "cat"], "emergente", COLOR_CONTORNO.emergente, COLOR_CONTORNO.persistente];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const sinMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Caja (oeste, sur, este, norte) de un municipio dentro del GeoJSON. */
function cajaDe(datos: GeoJSON.GeoJSON, cod: string): [number, number, number, number] | null {
  if (datos.type !== "FeatureCollection") return null;
  const f = datos.features.find((x) => x.properties?.c === cod);
  if (!f || (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon")) return null;
  let o = 180, s = 90, e = -180, n = -90;
  const rec = (a: unknown): void => {
    if (Array.isArray(a) && typeof a[0] === "number") {
      const [x, y] = a as number[];
      if (x < o) o = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    } else if (Array.isArray(a)) a.forEach(rec);
  };
  rec(f.geometry.coordinates);
  return o <= e ? [o, s, e, n] : null;
}

function cuantil(ordenado: number[], q: number): number {
  if (ordenado.length === 0) return 0;
  const i = Math.min(ordenado.length - 1, Math.max(0, Math.floor(q * (ordenado.length - 1))));
  return ordenado[i];
}

export default function MapaTasas({ conteos, munis, cambios, delito, conteosPorDelito, seleccionado, seleccionadoB, eligiendoB, onComparar, onCancelarComparar, onCerrarB, onSeleccion, onCerrar, etiquetaPeriodo }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMl | null>(null);
  const popup = useRef<Popup | null>(null);
  const [listo, setListo] = useState(false);
  const tema = useTema();
  const cbSel = useRef(onSeleccion);
  useEffect(() => {
    cbSel.current = onSeleccion;
  }, [onSeleccion]);

  const porCod = useMemo(() => new Map(munis.map((m) => [m.cod_mpio, m])), [munis]);
  const tasas = useMemo(() => {
    const t: Record<string, number> = {};
    for (const m of munis) if (m.pob > 0) t[m.cod_mpio] = ((conteos[m.cod_mpio] ?? 0) / m.pob) * 1e5;
    return t;
  }, [conteos, munis]);
  // el popup lee siempre los datos más recientes sin volver a registrar los manejadores del mapa
  const datosRef = useRef({ porCod, tasas, conteos });
  useEffect(() => {
    datosRef.current = { porCod, tasas, conteos };
  }, [porCod, tasas, conteos]);
  const rampa = tema === "oscuro" ? RAMPA_OSCURA : RAMPA_CLARA;
  const cortes = useMemo(() => {
    const v = Object.values(tasas).filter((x) => x > 0).sort((a, b) => a - b);
    const q = [0.1, 0.35, 0.6, 0.8, 0.95].map((p) => cuantil(v, p));
    const out: number[] = [];
    for (const x of q) if (out.length === 0 || x > out[out.length - 1]) out.push(x);
    return out;
  }, [tasas]);

  // 1) crear el mapa una sola vez
  useEffect(() => {
    let vivo = true;
    let m: MapaMl | undefined;
    (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl(ruta("/vendor/maplibre/maplibre-gl-worker.mjs"));
      if (!vivo || !contenedor.current) return;
      m = new ml.Map({
        container: contenedor.current,
        style: { version: 8, sources: {}, layers: [{ id: "fondo", type: "background", paint: { "background-color": "#e9f0f9" } }] },
        center: [-73.2, 4.6],
        zoom: 4.3,
        minZoom: 3.4,
        maxZoom: 10,
        attributionControl: { compact: true, customAttribution: "Límites: DANE MGN 2018" },
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      popup.current = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      m.on("load", () => {
        m!.addSource("mun", { type: "geojson", data: ruta("/data/municipios.geojson"), promoteId: "c" });
        m!.addLayer({ id: "mun-relleno", type: "fill", source: "mun", paint: { "fill-color": "#dfe6f0", "fill-opacity": 1 } });
        m!.addLayer({ id: "mun-borde", type: "line", source: "mun", paint: { "line-color": "#0b1f3a", "line-width": ANCHO_BORDE as never, "line-opacity": 0.4 } });
        m!.addLayer({
          id: "mun-caliente-halo", type: "line", source: "mun",
          paint: { "line-width": ["case", ["==", ["coalesce", ["feature-state", "cat"], ""], ""], 0, 5], "line-color": "#0b1f3a" },
        });
        m!.addLayer({ id: "mun-caliente", type: "line", source: "mun", paint: { "line-width": ANCHO_CAT as never, "line-color": COLOR_CAT as never } });
        m!.addLayer({
          id: "mun-sel", type: "line", source: "mun",
          paint: {
            "line-width": ["case", ["any", ["boolean", ["feature-state", "sel"], false], ["boolean", ["feature-state", "selB"], false]], 3.5, 0],
            "line-color": ["case", ["boolean", ["feature-state", "selB"], false], COLOR_B, COLOR_SELECCION] as never,
          },
        });
        // línea que une a los dos municipios del modo comparar
        m!.addSource("enlace", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m!.addLayer({ id: "enlace-halo", type: "line", source: "enlace", paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.85 } });
        m!.addLayer({ id: "enlace", type: "line", source: "enlace", paint: { "line-color": COLOR_B, "line-width": 2.5, "line-dasharray": [1.5, 1.5] } });
        // municipio seleccionado «levantado» del mapa; el filtro y la altura se fijan al seleccionar
        m!.addLayer({
          id: "mun-3d", type: "fill-extrusion", source: "mun", filter: ["in", ["get", "c"], ["literal", ["__ninguno__"]]],
          paint: { "fill-extrusion-color": "#2459b8", "fill-extrusion-height": 0, "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.96 },
        });
        m!.on("click", "mun-relleno", (e) => {
          const c = e.features?.[0]?.properties?.c as string | undefined;
          if (c) cbSel.current(c);
        });
        m!.on("mousemove", "mun-relleno", (e) => {
          m!.getCanvas().style.cursor = "pointer";
          const c = e.features?.[0]?.properties?.c as string | undefined;
          const { porCod: pc, tasas: ts, conteos: cn } = datosRef.current;
          const mu = c ? pc.get(c) : undefined;
          if (!mu) return;
          const t = ts[mu.cod_mpio];
          popup.current
            ?.setLngLat(e.lngLat)
            .setHTML(
              `<div style="color:#1c1a16;font:14px/1.4 system-ui"><strong>${esc(mu.municipio)}</strong><br/>${esc(mu.departamento)}<br/>${entero(cn[mu.cod_mpio] ?? 0)} denuncias · ${t !== undefined ? decimal(t) : "—"} por 100 mil</div>`,
            )
            .addTo(m!);
        });
        m!.on("mouseleave", "mun-relleno", () => {
          m!.getCanvas().style.cursor = "";
          popup.current?.remove();
        });
        m!.once("idle", () => vivo && setListo(true));
      });
      mapa.current = m;
    })();
    return () => {
      vivo = false;
      m?.remove();
      mapa.current = null;
      setListo(false);
    };
  }, []);

  // 2) colores y estados cuando cambian los datos o el tema
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const sinDato = cssVar("--map-nodata", "#dfe6f0");
    const stops: (number | string)[] = [-1, sinDato, 0, rampa[0]];
    cortes.forEach((c, i) => stops.push(c, rampa[Math.min(i + 1, rampa.length - 1)]));
    m.setPaintProperty("mun-relleno", "fill-color", ["interpolate", ["linear"], ["coalesce", ["feature-state", "v"], -1], ...stops] as never);
    m.setPaintProperty("mun-3d", "fill-extrusion-color", ["interpolate", ["linear"], ["coalesce", ["feature-state", "v"], -1], ...stops] as never);
    m.setPaintProperty("mun-borde", "line-color", cssVar("--map-line", "#0b1f3a"));
    m.setPaintProperty("mun-borde", "line-opacity", parseFloat(cssVar("--map-line-opacity", "0.4")));
    m.setPaintProperty("mun-caliente-halo", "line-color", cssVar("--map-casing", "#0b1f3a"));
    m.setPaintProperty("fondo", "background-color", cssVar("--paper-2", "#e9f0f9"));
    const cat = new Map(cambios.map((c) => [c.cod_mpio, c.categoria]));
    for (const mu of munis) {
      const v = mu.pob > 0 ? tasas[mu.cod_mpio] ?? 0 : -1;
      const cc = cat.get(mu.cod_mpio);
      m.setFeatureState({ source: "mun", id: mu.cod_mpio }, { v, cat: cc && cc !== "sin_patron" && cc !== "frio" ? cc : "" });
    }
  }, [listo, tasas, cortes, rampa, cambios, munis, tema]);

  // 3) selección: borde, atenuado del resto, extrusión 3D animada y vuelo de cámara (uno o dos municipios)
  const anterior = useRef<string>("");
  const animacion = useRef(0);
  const cajas = useRef<GeoJSON.GeoJSON | null>(null);
  const [distancia, setDistancia] = useState<number | null>(null);
  const ejes = useMemo(() => (seleccionado ? perfilPorDelito(seleccionado, munis, conteosPorDelito) : null), [seleccionado, munis, conteosPorDelito]);
  const ejesB = useMemo(() => (seleccionadoB ? perfilPorDelito(seleccionadoB, munis, conteosPorDelito) : null), [seleccionadoB, munis, conteosPorDelito]);
  const pctDe = useMemo(() => {
    const todasTasas = Object.values(tasas);
    return (cod: string, e: typeof ejes) => {
      if (delito !== TODOS) return e?.find((x) => x.id === delito)?.valor ?? 0;
      return tasas[cod] !== undefined ? percentil(tasas[cod], todasTasas) : 0;
    };
  }, [delito, tasas]);
  const pctA = seleccionado ? pctDe(seleccionado, ejes) : 0;
  const pctB = seleccionadoB ? pctDe(seleccionadoB, ejesB) : 0;
  const anteriorB = useRef<string>("");
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    if (anterior.current) m.setFeatureState({ source: "mun", id: anterior.current }, { sel: false });
    if (anteriorB.current) m.setFeatureState({ source: "mun", id: anteriorB.current }, { selB: false });
    if (seleccionado) m.setFeatureState({ source: "mun", id: seleccionado }, { sel: true });
    if (seleccionadoB) m.setFeatureState({ source: "mun", id: seleccionadoB }, { selB: true });
    const cambio = anterior.current !== seleccionado || anteriorB.current !== seleccionadoB;
    anterior.current = seleccionado;
    anteriorB.current = seleccionadoB;
    const hay = Boolean(seleccionado);
    const resaltado = ["any", ["boolean", ["feature-state", "sel"], false], ["boolean", ["feature-state", "selB"], false]];
    m.setPaintProperty("mun-relleno", "fill-opacity", hay ? (["case", resaltado, 1, 0.42] as never) : 1);
    m.setFilter("mun-3d", ["in", ["get", "c"], ["literal", [seleccionado || "__ninguno__", seleccionadoB || "__ninguno__"]]]);

    let cancelado = false;
    cancelAnimationFrame(animacion.current);
    const enlace = m.getSource("enlace") as GeoJSONSource | undefined;
    if (!seleccionado) {
      m.setPaintProperty("mun-3d", "fill-extrusion-height", 0);
      enlace?.setData({ type: "FeatureCollection", features: [] });
      if (cambio) m.easeTo({ pitch: 0, duration: sinMovimiento() ? 0 : 900 });
      return;
    }
    (async () => {
      cajas.current ??= await (m.getSource("mun") as GeoJSONSource).getData();
      const cA = cajas.current ? cajaDe(cajas.current, seleccionado) : null;
      const cB = seleccionadoB && cajas.current ? cajaDe(cajas.current, seleccionadoB) : null;
      if (cancelado || !cA) return;
      const centro = (c: [number, number, number, number]): [number, number] => [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2];
      if (cB) {
        enlace?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [centro(cA), centro(cB)] } });
        setDistancia(distanciaKm(centro(cA), centro(cB)));
      } else {
        enlace?.setData({ type: "FeatureCollection", features: [] });
        setDistancia(null);
      }
      // las alturas suben desde cero hasta las que corresponden a su tasa (sin animación si la persona pide menos movimiento)
      const hA = alturaExtrusion(pctA, ladoMayorM(cA));
      const hB = cB ? alturaExtrusion(pctB, ladoMayorM(cB)) : 0;
      const poner = (k: number) =>
        m.setPaintProperty("mun-3d", "fill-extrusion-height", ["match", ["get", "c"], seleccionado, hA * k, seleccionadoB || "__ninguno__", hB * k, 0] as never);
      if (sinMovimiento() || !cambio) {
        poner(1);
      } else {
        poner(0);
        const t0 = performance.now();
        const paso = (t: number) => {
          const k = Math.min(1, (t - t0 - 600) / 1100); // empieza cuando la cámara ya va llegando
          poner(1 - Math.pow(1 - Math.max(0, k), 3));
          if (k < 1) animacion.current = requestAnimationFrame(paso);
        };
        animacion.current = requestAnimationFrame(paso);
      }
      if (!cambio) return;
      const todo: [number, number, number, number] = cB ? [Math.min(cA[0], cB[0]), Math.min(cA[1], cB[1]), Math.max(cA[2], cB[2]), Math.max(cA[3], cB[3])] : cA;
      const ancho = contenedor.current?.clientWidth ?? 0;
      m.fitBounds([[todo[0], todo[1]], [todo[2], todo[3]]], {
        padding: { top: 50, bottom: 40, right: 40, left: ancho >= 640 ? (cB ? 420 : 360) : 40 },
        maxZoom: cB ? 8.2 : 9.2,
        pitch: cB ? 50 : 56,
        duration: sinMovimiento() ? 0 : 1700,
      });
    })();
    return () => {
      cancelado = true;
      cancelAnimationFrame(animacion.current);
    };
  }, [seleccionado, seleccionadoB, listo, ejes, ejesB, pctA, pctB]);

  const leyenda = [0, ...cortes];
  return (
    <figure className="m-0">
      <div className="relative">
        <div
          ref={contenedor}
          role="region"
          aria-label="Mapa de municipios de Colombia coloreados por tasa de denuncias. La misma información está en las tablas y en los filtros."
          className="h-[26rem] w-full border border-rule sm:h-[34rem]"
        />
        {ejes && seleccionado && porCod.get(seleccionado) && seleccionadoB && porCod.get(seleccionadoB) ? (
          <CompararMunicipios
            a={{ nombre: porCod.get(seleccionado)!.municipio, departamento: porCod.get(seleccionado)!.departamento, ejes }}
            b={{ nombre: porCod.get(seleccionadoB)!.municipio, departamento: porCod.get(seleccionadoB)!.departamento, ejes: ejesB ?? [] }}
            distanciaKm={seleccionadoB ? distancia : null}
            onSalir={onCerrarB}
            onCambiarB={onComparar}
          />
        ) : (
          ejes &&
          seleccionado &&
          porCod.get(seleccionado) && (
            <PerfilMunicipio
              municipio={porCod.get(seleccionado)!.municipio}
              departamento={porCod.get(seleccionado)!.departamento}
              ejes={ejes}
              extras={datosClave(seleccionado, cambios, delito !== TODOS)}
              delito={delito}
              categoria={cambios.find((c) => c.cod_mpio === seleccionado)?.categoria ?? ""}
              onCerrar={onCerrar}
              eligiendo={eligiendoB}
              onComparar={onComparar}
              onCancelarComparar={onCancelarComparar}
            />
          )
        )}
        {!listo && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-ink2" aria-live="polite">
            Cargando mapa…
          </div>
        )}
      </div>
      <figcaption className="mt-3 flex flex-col gap-3 text-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Tasa por 100 000 hab. · {etiquetaPeriodo}</p>
          <div className="mt-2 flex h-3 w-64 max-w-full overflow-hidden border border-rule" aria-hidden="true">
            {rampa.map((c) => (
              <span key={c} className="flex-1" style={{ background: c }} />
            ))}
          </div>
          <div className="mono mt-1 flex w-64 max-w-full justify-between text-xs text-ink2">
            <span>{decimal(leyenda[0] ?? 0)}</span>
            <span>{decimal(leyenda[Math.floor(leyenda.length / 2)] ?? 0)}</span>
            <span>{decimal(leyenda[leyenda.length - 1] ?? 0)}+</span>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2" aria-label="Contornos de puntos calientes">
          {[
            ["persistente", COLOR_CONTORNO.persistente, 3],
            ["emergente", COLOR_CONTORNO.emergente, 3],
            ["en disminución", COLOR_CONTORNO.en_disminucion, 1],
          ].map(([t, c, h]) => (
            <li key={t as string}>
              <span className="mr-1.5 inline-block w-6 align-middle" style={{ background: c as string, height: (h as number) + 4, border: "2px solid var(--map-casing)" }} />
              {t}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
