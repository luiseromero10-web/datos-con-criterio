"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapaMl, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cssVar, useTema } from "@/lib/useTema";
import { decimal, entero } from "@/lib/format";
import type { Cambio, Muni } from "@/lib/datos";

type Props = {
  conteos: Record<string, number>;
  munis: Muni[];
  cambios: Cambio[];
  seleccionado: string;
  onSeleccion: (cod: string) => void;
  etiquetaPeriodo: string;
};

const RAMPA_CLARA = ["#f4e8c6", "#eec26b", "#e08a3c", "#c4491f", "#8e1f12", "#4d0d0f"];
const RAMPA_OSCURA = ["#2b2418", "#5f3a1c", "#a35a22", "#dd7a30", "#ffb454", "#ffe3b0"];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function cuantil(ordenado: number[], q: number): number {
  if (ordenado.length === 0) return 0;
  const i = Math.min(ordenado.length - 1, Math.max(0, Math.floor(q * (ordenado.length - 1))));
  return ordenado[i];
}

export default function MapaTasas({ conteos, munis, cambios, seleccionado, onSeleccion, etiquetaPeriodo }: Props) {
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
      ml.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      if (!vivo || !contenedor.current) return;
      m = new ml.Map({
        container: contenedor.current,
        style: { version: 8, sources: {}, layers: [{ id: "fondo", type: "background", paint: { "background-color": "#e9e2d0" } }] },
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
        m!.addSource("mun", { type: "geojson", data: "/data/municipios.geojson", promoteId: "c" });
        m!.addLayer({ id: "mun-relleno", type: "fill", source: "mun", paint: { "fill-color": "#ddd5c0", "fill-opacity": 1 } });
        m!.addLayer({ id: "mun-borde", type: "line", source: "mun", paint: { "line-color": "#f3eee3", "line-width": 0.25, "line-opacity": 0.6 } });
        m!.addLayer({
          id: "mun-caliente", type: "line", source: "mun",
          paint: {
            "line-width": ["case", ["==", ["feature-state", "cat"], "persistente"], 2.4, ["==", ["feature-state", "cat"], "emergente"], 2.4, ["==", ["feature-state", "cat"], "en_disminucion"], 1.8, 0],
            "line-color": ["match", ["feature-state", "cat"], "persistente", "#000000", "emergente", "#0b6e69", "en_disminucion", "#9a5b00", "#000000"],
          },
        });
        m!.addLayer({ id: "mun-sel", type: "line", source: "mun", paint: { "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 3.5, 0], "line-color": "#d4af00" } });
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
    const sinDato = cssVar("--map-nodata", "#ddd5c0");
    const stops: (number | string)[] = [-1, sinDato, 0, rampa[0]];
    cortes.forEach((c, i) => stops.push(c, rampa[Math.min(i + 1, rampa.length - 1)]));
    m.setPaintProperty("mun-relleno", "fill-color", ["interpolate", ["linear"], ["coalesce", ["feature-state", "v"], -1], ...stops] as never);
    m.setPaintProperty("mun-borde", "line-color", cssVar("--map-line", "#f3eee3"));
    m.setPaintProperty("mun-caliente", "line-color", ["match", ["feature-state", "cat"], "persistente", tema === "oscuro" ? "#ffffff" : "#000000", "emergente", tema === "oscuro" ? "#5eead4" : "#0b6e69", "en_disminucion", tema === "oscuro" ? "#fbbf24" : "#9a5b00", "#000000"] as never);
    m.setPaintProperty("fondo", "background-color", cssVar("--paper-2", "#ebe4d3"));
    const cat = new Map(cambios.map((c) => [c.cod_mpio, c.categoria]));
    for (const mu of munis) {
      const v = mu.pob > 0 ? tasas[mu.cod_mpio] ?? 0 : -1;
      const cc = cat.get(mu.cod_mpio);
      m.setFeatureState({ source: "mun", id: mu.cod_mpio }, { v, cat: cc && cc !== "sin_patron" && cc !== "frio" ? cc : "" });
    }
  }, [listo, tasas, cortes, rampa, cambios, munis, tema]);

  // 3) selección
  const anterior = useRef<string>("");
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    if (anterior.current) m.setFeatureState({ source: "mun", id: anterior.current }, { sel: false });
    if (seleccionado) m.setFeatureState({ source: "mun", id: seleccionado }, { sel: true });
    anterior.current = seleccionado;
  }, [seleccionado, listo]);

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
          <li><span className="mr-1 inline-block h-0.5 w-5 bg-ink align-middle" style={{ height: 3 }} />persistente</li>
          <li><span className="mr-1 inline-block w-5 align-middle" style={{ background: tema === "oscuro" ? "#5eead4" : "#0b6e69", height: 3 }} />emergente</li>
          <li><span className="mr-1 inline-block w-5 align-middle" style={{ background: tema === "oscuro" ? "#fbbf24" : "#9a5b00", height: 2 }} />en disminución</li>
        </ul>
      </figcaption>
    </figure>
  );
}
