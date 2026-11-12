# Fuentes de datos — verificación de la Fase 0

Verificado el 2026-11-09 consultando directamente la API de datos.gov.co (Socrata) y las páginas del DANE.
Los números salen de consultas reales; lo que no pude confirmar está marcado como **pendiente**.

## 1. Hallazgo principal: hay dos familias de conjuntos

| | Familia A: Observatorio MDN (MinDefensa) | Familia B: DIJIN (Policía Nacional) |
|---|---|---|
| Fecha del hecho | `fecha_hecho` tipo fecha real | `fecha_hecho` **texto** `dd/mm/aaaa` |
| Código de municipio | `cod_muni` (DIVIPOLA, 5 dígitos) | `codigo_dane` (texto) |
| Último dato | **2026-09-30** | 2026-07-31 (extracción 31-ago-2026) |
| Esquema | homogéneo entre delitos: fecha, cod_depto, cod_muni, cantidad (+ sexo, zona, arma según delito) | varía por conjunto (`tipo_de_hurto`, `descripci_n_conducta`, `cantidad` a veces texto) |
| Actualizado en el portal | 2026-10-21 | 2026-09-01 |

**Recomendación:** usar la familia A como fuente principal y la B solo para reconciliar totales en la Fase 1.
Ambas vienen de SIEDCO, pero la A es más fresca y más fácil de procesar. Es una decisión suya: ver sección 5.

## 2. Conjuntos de la familia A (propuestos)

Todos en `www.datos.gov.co`, API `https://www.datos.gov.co/resource/<id>.json`. Atribución: Ministerio de Defensa Nacional.

| Delito del plan | ID | Columnas | Desde | Hasta | Filas | Cantidad anual reciente |
|---|---|---|---|---|---|---|
| Homicidio (intencional + feminicidio) | `m8fd-ahd9` | fecha_hecho, cod_depto, cod_muni, zona, sexo, arma_medio, _modalidad_presunta, spoa_caracterizacion, cantidad | 2003 | 2026-09-30 | — | 2023: 13 555 · 2024: 13 497 · 2025: 14 038 |
| Lesiones personales | `jr6v-i33g` | fecha_hecho, cod_depto, cod_muni, sexo, cantidad | 2010 (verificar si hay antes) | 2026-09-30 | 920 420 | 2023: 98 886 · 2024: 90 946 · 2025: 88 016 |
| Hurto a personas | `4rxi-8m8d` | fecha_hecho, cod_depto, cod_muni, cantidad | 2003 | 2026-09-30 | — | 2023: 391 005 · 2024: 316 216 · 2025: 289 374 |
| Hurto a comercio | `7i2x-h5vp` | fecha_hecho, cod_depto, cod_muni, cantidad | 2010 | 2026-09-30 | 680 252 | 2023: 43 023 · 2024: 38 462 · 2025: 26 331 |
| Hurto a residencias | `7mn7-vzqp` | …, tipo_delito, cantidad | 2010 | 2026-09-30 | 618 342 | 2023: 35 701 · 2024: 29 662 · 2025: 25 813 |
| Hurto a vehículos (motos y automotores) | `csb4-y6v2` | …, tipo_delito, zona, cantidad | 2010 | 2026-09-30 | 389 928 | 2023: 53 297 · 2024: 51 138 · 2025: 44 022 |
| Extorsión (opcional, no está en el plan) | `q2ib-t9am` | fecha_hecho, cod_depto, cod_muni, cantidad | 2010 | 2026-09-30 | 132 453 | 2025: 13 417 |

El resto del catálogo MDN (no usado): hurto de abigeato `p88b-5ac7`, piratería terrestre `sutf-7dyz`, entidades financieras `i7h7-wmjc`,
delitos informáticos `4v6r-wu98`, lesiones en accidente de tránsito `ntej-qq7v`, homicidio en accidente de tránsito `uav5-b85g`, masacres `u8eq-92tb`.

Conjuntos de la familia B para reconciliar: `d4fr-sbn2` (abigeato, bancos, piratería), `9vha-vh9n` (motos y automotores),
`6sqw-8cg5` (residencias y comerciales), `72sg-cybi` (lesiones), `ha6j-pa2r` (homicidios en accidente de tránsito).
**No encontré un conjunto de hurto a personas ni de homicidio intencional en la familia B**; solo existen en la A.

## 3. Problemas de datos ya detectados (para la metodología)

1. **Corte parcial.** Los datos llegan a 2026-09-30, así que 2026 tiene 9 meses. Hay que excluir años incompletos de las comparaciones anuales.
2. **Registro tardío.** Los propios conjuntos dicen "cifras sujetas a variación". Falta medir *N* comparando cargas sucesivas (Fase 1); hoy solo existe una carga.
3. **Hurto a personas 2008:** 815 filas contra 16 000-18 000 en los años vecinos, aunque la suma de `cantidad` no cae. Parece un cambio de agregación. Hay que revisar antes de usar 2003-2009.
4. **Los hurtos muestran quiebres de nivel.** Hurto a comercio pasa de 22 466 (2015) a 60 311 (2017); residencias de 24 191 a 46 550 en 2016-2017.
   Probable cambio de criterio de registro, no de realidad. Esto condiciona el año de inicio.
5. **Diferencias entre familias.** Hurto a comercio 2024: A = 38 462 contra B = 68 123 registros en `6sqw-8cg5`, y B etiqueta como "residencias" solo 70 072 registros en total contra 618 342 de A.
   Las categorías no se corresponden uno a uno. Hay que reconciliarlas en la Fase 1 antes de hablar de "totales que cuadran ±1 %".
6. **Hurto a personas:** `cantidad` suma casi 7 veces más que el número de filas desde 2017, o sea que hay filas agregadas por día y municipio con cantidades altas.
7. **Caída reciente en hurto a comercio y residencias (2024-2025):** puede ser real o un cambio de cobertura. Verificar antes de pronosticar.
8. **Lesiones y accidentes de tránsito:** en la familia B se mezclan (455 359 de 907 890 son culposas en tránsito). En la A están separadas; usar `jr6v-i33g` y no `ntej-qq7v`.
9. **Ruido de nombres:** nombres de municipio escritos distinto. Usar solo `cod_muni`. Hay 1 108-1 113 códigos distintos en los datos contra 1 122 en DIVIPOLA.

## 4. Catálogo y población

### DIVIPOLA (municipios)
- `gdxc-w37w` "DIVIPOLA- Códigos municipios" (DANE), 1 122 filas, actualizado 2026-09-24.
- Columnas: `cod_dpto`, `dpto`, `cod_mpio`, `nom_mpio`, `tipo_municipio`, `longitud`, `latitud`. Las coordenadas vienen con **coma decimal** (texto): hay que convertirlas.
- También existe `vcjz-niiq` (departamentos).

### Población (DANE)
No está en datos.gov.co como conjunto nacional; solo hay conjuntos de municipios sueltos. La fuente es el sitio del DANE (base CNPV 2018), archivos xlsx:
- 2018-2042 por área, municipal (8-ago-2025): `https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Municipal/PPED-AreaMun-2018-2042_VP.xlsx`
- 2005-2017 (8-ago-2025): `.../Municipal/DCD-area-proypoblacion-Mun-2005-2017_VP.xlsx`
- 1995-2004 y 1985-1994 (mar-2023), si hiciera falta.
- Página: <https://www.dane.gov.co/index.php/estadisticas-por-tema/demografia-y-poblacion/proyecciones-de-poblacion>

Nota: las series de 2005-2017 y 2018-2042 son de la misma base pero hay que verificar que empalmen sin salto en 2017-2018. No he descargado los archivos todavía.

### Marco Geoestadístico Nacional (MGN) — resuelto el 2026-11-11
Capa **Municipio del MGN Integrado, versión 2018**, publicada por el DANE y enlazada desde datos.gov.co (`dnxb-k5pj`, "federated_href"):
`https://portalgis.dane.gov.co/mparcgis/rest/services/MGN2018/Serv_CapaMunicipiosInt_2018/MapServer/0` (ArcGIS REST; admite GeoJSON; 1 122 polígonos, `MPIO_CDPMP` = código DIVIPOLA).
Se descarga con `pipelines/seguridad/mgn.py` (WGS84, simplificación de servidor de ~55 m, solo 4 campos): 8,6 MB en `data/raw/mgn_municipios_2018.geojson`.
Diferencias con DIVIPOLA: el MGN trae `94663` (Mapiripana) y no `27493` (Nuevo Belén de Bajirá, creado después de 2018). **Ninguno tiene hechos en los datos**, así que no afectan a los resultados.
Limitación: es la vigencia 2018; los límites de municipios creados o modificados desde entonces no están. Para contigüidad y mapa es suficiente.

## 5. Recomendación de alcance (para confirmar)

**Delitos (6):** homicidio, lesiones personales, hurto a personas, hurto a comercio, hurto a residencias, hurto a vehículos
(motos y automotores separados con `tipo_delito`, lo que permite cubrir "hurto de motos" y "hurto de vehículos" del plan). Extorsión como séptimo opcional.

**Desde cuándo: 2018 a 2026-09.** Razones:
- Evita los quiebres de nivel de 2016-2017 en hurto a comercio y residencias (punto 4 de la sección 3).
- Coincide con el censo 2018 y con la serie de población 2018-2042, sin empalme.
- Da ~8,75 años (~450 semanas): suficiente para estacionalidad anual y 12 cortes de backtest con horizonte de 8 semanas.
- 2020 (pandemia) queda dentro y se trata como un periodo atípico, no se oculta.
Alternativa: 2015+ para homicidio y hurto a vehículos (series estables), con año de inicio distinto por delito. Es más complejo y lo desaconsejo para el MVP.

**Tamaño estimado:** a 2018+ las seis fuentes suman unas 1,5 millones de filas crudas; el gold semanal por municipio y delito cabe holgadamente en el objetivo de < 30 MB.
(Estimación mía; se confirma en la Fase 1.)

## 6. Cambios que sugiero al plan

1. Sustituir "SIEDCO de la Policía" por "SIEDCO publicado por MinDefensa y la DIJIN" y usar la familia A como principal (sección 1).
2. Cambiar "histórico desde 2015" por "desde 2018" (sección 5).
3. Aclarar que el criterio "totales ±1 %" se mide contra la propia fuente tras reconciliar categorías, porque las dos familias no coinciden (punto 5).
4. Fase 0 no incluye `uv`: no está instalado en esta máquina (ver `docs/decisiones.md`).

## 7. Preguntas que necesito que responda

1. ¿Confirma la familia A (MDN) como fuente principal?
2. ¿Confirma los 6 delitos y el inicio en 2018? ¿Incluimos extorsión?
3. ¿Autoriza instalar `uv` (por ejemplo `winget install astral-sh.uv`) para configurar Python 3.12?
4. MGN: ¿lo descarga usted del Geoportal o busco alternativa?
