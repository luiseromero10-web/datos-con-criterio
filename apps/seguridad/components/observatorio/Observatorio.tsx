"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArticulosRelacionados, Comentarios, FormularioFeedback, track } from "@dcc/comunidad";
import Filtros from "./Filtros";
import Perezoso from "@/components/Perezoso";
import Cifras, { type CifrasDatos } from "./Cifras";
import { TablaAnomalias, TablaCambios } from "./Tablas";
import { DELITOS, nombreDelito, type DelitoId } from "@/lib/delitos";
import { fechaLarga } from "@/lib/format";
import {
  anomaliasDe, anomaliasRecientes, cambiosHotspots, cargarMeta, cargarMunicipios, conteosPorMunicipio, periodosDisponibles,
  pronostico, serieSemanal, sumarMeses, totalNacional,
  type Alcance, type Anomalia, type Cambio, type Meta, type Muni, type Punto, type PuntoPron,
} from "@/lib/datos";

const MapaTasas = dynamic(() => import("./MapaTasas"), {
  ssr: false,
  loading: () => <div className="grid h-[26rem] place-items-center border border-rule text-sm text-ink2 sm:h-[34rem]">Cargando mapa…</div>,
});
const SerieTiempo = dynamic(() => import("./SerieTiempo"), {
  ssr: false,
  loading: () => <div className="grid h-[22rem] place-items-center border border-rule text-sm text-ink2 sm:h-[26rem]">Cargando gráfico…</div>,
});

function Seccion({ numero, titulo, children, id }: { numero: string; titulo: string; children: React.ReactNode; id: string }) {
  // El identificador del título debe ser una sola palabra: con espacios, aria-labelledby lo leería como varias referencias.
  const idTitulo = `titulo-${id}`;
  return (
    <section id={id} className="mt-14" aria-labelledby={idTitulo}>
      <div className="rule-top pt-3">
        <p className="eyebrow">{numero}</p>
        <h2 id={idTitulo} className="display mt-1 text-2xl font-semibold sm:text-3xl">{titulo}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function Observatorio() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [munis, setMunis] = useState<Muni[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [delito, setDelito] = useState<DelitoId>("homicidio");
  const [dpto, setDpto] = useState("");
  const [mpio, setMpio] = useState("");
  const [periodoId, setPeriodoId] = useState("ult12");

  const [conteos, setConteos] = useState<Record<string, number>>({});
  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [cifras, setCifras] = useState<CifrasDatos | null>(null);
  const [recientes, setRecientes] = useState<Anomalia[]>([]);
  const [serie, setSerie] = useState<Punto[]>([]);
  const [pron, setPron] = useState<{ puntos: PuntoPron[]; nivelUsado: string }>({ puntos: [], nivelUsado: "nacional" });
  const [anoms, setAnoms] = useState<Anomalia[]>([]);
  const [cargandoSerie, setCargandoSerie] = useState(true);

  useEffect(() => {
    let vivo = true;
    Promise.all([cargarMeta(), cargarMunicipios()])
      .then(([m, u]) => {
        if (!vivo) return;
        setMeta(m);
        setMunis(u);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        track("error_datos", "inicio");
        setError(e instanceof Error ? e.message : "Error al cargar los datos");
      });
    return () => {
      vivo = false;
    };
  }, []);

  const periodos = useMemo(() => (meta ? periodosDisponibles(meta) : []), [meta]);
  const periodo = periodos.find((p) => p.id === periodoId) ?? periodos[0];
  const alcance: Alcance = mpio ? { tipo: "mpio", cod: mpio } : dpto ? { tipo: "dpto", cod: dpto } : { tipo: "nacional" };
  const claveAlcance = `${alcance.tipo}:${"cod" in alcance ? alcance.cod : ""}`;
  const ultima = meta?.ultima_semana_entrenamiento ?? meta?.fecha_corte ?? "";

  // mapa, cifras y tablas: dependen del delito y del periodo
  useEffect(() => {
    if (!meta || !periodo || munis.length === 0) return;
    let vivo = true;
    const base = periodos[0];
    (async () => {
      try {
        const desdeAnom = new Date(Date.parse(ultima.slice(0, 10) + "T00:00:00Z") - 51 * 7 * 86400000).toISOString().slice(0, 10);
        const [cn, hot, h12, hPrev, an] = await Promise.all([
          conteosPorMunicipio(delito, periodo.desde, periodo.hasta),
          cambiosHotspots(delito),
          totalNacional(delito, base.desde, base.hasta),
          totalNacional(delito, sumarMeses(base.desde, -12), sumarMeses(base.hasta, -12)),
          anomaliasRecientes(delito, desdeAnom, 5000),
        ]);
        if (!vivo) return;
        const pobTotal = munis.reduce((s, m) => s + (m.pob > 0 ? m.pob : 0), 0);
        setConteos(cn);
        setCambios(hot);
        setRecientes(an);
        setCifras({
          hechos12: h12,
          hechosPrev12: hPrev,
          tasa12: pobTotal > 0 ? (h12 / pobTotal) * 1e5 : 0,
          puntosCalientes: hot.filter((c) => c.categoria === "emergente" || c.categoria === "persistente").length,
          semanasAtipicas: an.length,
        });
      } catch (e) {
        if (vivo) {
          track("error_datos", "consulta");
          setError(e instanceof Error ? e.message : "Error al consultar los datos");
        }
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, munis, delito, periodo?.id]);

  // serie, pronóstico y anomalías del alcance elegido
  useEffect(() => {
    if (!meta) return;
    let vivo = true;
    (async () => {
      try {
        setCargandoSerie(true);
        const [s, p, a] = await Promise.all([serieSemanal(delito, alcance), pronostico(delito, alcance), anomaliasDe(delito, alcance)]);
        if (!vivo) return;
        setSerie(s);
        setPron(p);
        setAnoms(a);
        setCargandoSerie(false);
      } catch (e) {
        if (vivo) {
          track("error_datos", "serie");
          setError(e instanceof Error ? e.message : "Error al consultar la serie");
        }
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, delito, claveAlcance]);

  const nombreAlcance = useMemo(() => {
    if (alcance.tipo === "mpio") {
      const m = munis.find((x) => x.cod_mpio === alcance.cod);
      return m ? `${m.municipio}, ${m.departamento}` : alcance.cod;
    }
    if (alcance.tipo === "dpto") return munis.find((x) => x.cod_dpto === alcance.cod)?.departamento ?? alcance.cod;
    return "Colombia";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveAlcance, munis]);

  const seleccionar = (cod: string) => {
    setDpto(cod.slice(0, 2));
    setMpio(cod);
  };

  if (error) {
    return (
      <div role="alert" className="panel mt-10 p-5">
        <p className="font-medium">No se pudieron cargar los datos.</p>
        <p className="mt-1 text-sm text-ink2">{error}. Revise su conexión e intente de nuevo; los datos se leen directamente desde el almacenamiento público del proyecto.</p>
        <button type="button" className="mt-3 border border-ink px-4 py-2 min-h-11" onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }

  const cargando = !meta || munis.length === 0;
  const notaPron =
    pron.nivelUsado === "dpto" && alcance.tipo === "mpio"
      ? "Este municipio tiene pocos hechos por semana para pronosticarse por separado; se muestra el pronóstico de su departamento."
      : alcance.tipo === "nacional"
        ? "A nivel nacional se suma el pronóstico por departamento; esa suma no tiene intervalo propio."
        : "";

  return (
    <>
      <div className="mt-8"><Filtros delito={delito} onDelito={(d) => { setDelito(d); track("filtro_delito", d); }} dpto={dpto} onDpto={(c) => { setDpto(c); setMpio(""); track("filtro_departamento", c || "pais"); }} mpio={mpio} onMpio={(c) => { setMpio(c); if (c) track("filtro_municipio"); }} periodo={periodoId} onPeriodo={(p) => { setPeriodoId(p); track("filtro_periodo", p); }} periodos={periodos} munis={munis} /></div>

      <div className="mt-8"><Cifras d={cargando ? null : cifras} /></div>

      <Seccion numero="01 · Dónde" titulo={`Mapa de tasas: ${nombreDelito(delito).toLowerCase()}`} id="mapa">
        {cargando ? (
          <div className="grid h-[26rem] place-items-center border border-rule text-sm text-ink2 sm:h-[34rem]" aria-busy="true">Cargando datos…</div>
        ) : (
          <Perezoso alto="h-[26rem] sm:h-[34rem]">
            <MapaTasas conteos={conteos} munis={munis} cambios={cambios} seleccionado={mpio} onSeleccion={(c) => { track("clic_mapa"); seleccionar(c); }} etiquetaPeriodo={periodo?.etiqueta ?? ""} />
          </Perezoso>
        )}
        <p className="mt-3 max-w-prose text-sm text-ink2">
          Cada municipio se colorea por su tasa de denuncias por 100 000 habitantes (población DANE 2026). Haga clic en un municipio para ver su serie abajo.
          Un contorno marca los puntos calientes: zonas donde las tasas altas se agrupan en el espacio, con una corrección por comparaciones múltiples.
        </p>
      </Seccion>

      <Seccion numero="02 · Cuándo" titulo={`Serie semanal y pronóstico: ${nombreAlcance}`} id="serie">
        <p className="mb-4 max-w-prose text-sm text-ink2">
          Línea oscura: denuncias por semana. Línea verde: pronóstico a 16 semanas con su intervalo del 80 %. Las últimas {meta?.semanas_provisionales ?? 8} semanas son provisionales:
          los registros llegan con retraso y esas cifras suelen corregirse al alza. Los puntos marcan semanas atípicas.
        </p>
        <div aria-busy={cargandoSerie}>
          <Perezoso alto="h-[22rem] sm:h-[26rem]">
          <SerieTiempo
              titulo={`${nombreDelito(delito)} en ${nombreAlcance}`}
              serie={serie}
              pron={pron.puntos}
              anomalias={anoms}
              ultimaConfiable={ultima.slice(0, 10)}
              conBanda={alcance.tipo !== "nacional"}
            />
          </Perezoso>
        </div>
        {notaPron && <p className="mt-2 text-sm text-ink2">{notaPron}</p>}
      </Seccion>

      <Seccion numero="03 · Qué cambió" titulo="Municipios con mayor variación" id="cambios">
        <TablaCambios cambios={cambios} munis={munis} onSeleccion={(c) => { track("clic_tabla_cambios"); seleccionar(c); }} />
      </Seccion>

      <Seccion numero="04 · Qué se salió de lo normal" titulo="Semanas atípicas del último año" id="atipicas">
        <TablaAnomalias anomalias={recientes} munis={munis} onSeleccion={(c) => { track("clic_tabla_atipicas"); seleccionar(c); }} />
      </Seccion>

      <Seccion numero="05 · Su opinión" titulo="Comentarios y feedback" id="opinion">
        <div className="grid gap-12 lg:grid-cols-2">
          <Comentarios hilo="app:seguridad" titulo="Comentarios sobre esta herramienta" />
          <FormularioFeedback />
        </div>
        <ArticulosRelacionados app="seguridad" />
      </Seccion>

      <section className="mt-14 rule-top pt-3" aria-label="Fuente y actualización">
        <p className="mono text-sm">
          Datos actualizados al {meta ? fechaLarga(meta.fecha_corte) : "…"}
          {meta?.version_modelo ? ` · modelo ${meta.version_modelo}` : ""}
        </p>
        <p className="mt-1 text-sm text-ink2">
          Las cifras son denuncias registradas, no delitos reales. Lea los{" "}
          <Link className="underline underline-offset-4" href="/metodologia">límites y la metodología</Link>.{" "}
          <a className="underline underline-offset-4" href="https://github.com/luiseromero10-web/datos-con-criterio">Código fuente</a>.
        </p>
        <p className="sr-only">{DELITOS.length} delitos disponibles.</p>
      </section>
    </>
  );
}
