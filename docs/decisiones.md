# Registro de decisiones

## 2026-11-09 · D1 · Familia de conjuntos fuente
Se propone usar la familia del Observatorio MDN (MinDefensa) en datos.gov.co: esquema homogéneo, `fecha_hecho` como fecha real,
`cod_muni` DIVIPOLA y datos hasta 2026-09-30, frente a los de DIJIN (fecha en texto, `codigo_dane`, corte 2026-07-31).
Los de DIJIN se usan para reconciliar totales. Pendiente de confirmación del autor. Ver docs/fuentes.md.

## 2026-11-09 · D2 · `uv` no instalado
No está instalado en la máquina; se pide autorización para instalarlo antes de crear `pyproject.toml`.

## 2026-11-09 · D3 · Confirmaciones (mensaje "avancemos")
Se tomó "avancemos" como aprobación de las recomendaciones de docs/fuentes.md: familia A (MDN), seis delitos (sin extorsión), inicio en 2018 e instalar `uv`
(instalado con winget). MGN sigue sin definir; no se necesita hasta la Fase 4.

## 2026-11-09 · D4 · Python 3.12 con uv
`.python-version` = 3.12. uv avisa "Missing expected target directory" al resolver 3.12 pero funciona; es un aviso del enlace de versión menor, no un fallo.

## 2026-11-09 · D5 · Resultados de la Fase 1 (local)
- Bronze: 1 775 265 filas crudas (6 delitos, 2018-01 a 2026-09). Silver: 4 714 449 hechos (suma de `cantidad`).
- **Totales anuales por delito = fuente exacta (0,00 %)** en todos los años 2018-2026 (comprobado contra la API con agregación SoQL).
- Gold: `municipios`, `hechos_mes_mpio` (1,2 MB), `hechos_semana_mpio` (2,2 MB). Muy por debajo de 30 MB.
- **3 hechos (de 4,7 millones) con `cod_muni` = 52000** (Nariño sin municipio) no entran al gold porque no hay municipio en DIVIPOLA. Se documentan; no se reasignan.
- Población DANE: el xlsx trae 1 123 municipios y DIVIPOLA 1 122; sobra `94663` (Mapiripana, Guainía). No afecta a los hechos.
- La semana se define como lunes de la semana ISO; la última (2026-09-28) es parcial (hasta el 30-sep).
- **Intermitencia (semanas con al menos un hecho, sobre 456):** solo 12 municipios tienen ≥400 semanas con homicidios, 36 en hurto a comercio, 41 en vehículos, 42 en residencias, 91 en lesiones, 108 en hurto a personas.
  En homicidio 1 072 de 1 122 municipios tienen menos de la mitad de las semanas con datos. Consecuencia para la Fase 3: pronóstico semanal municipal solo donde hay volumen; el resto a nivel departamental o mensual.
- No se detectaron cambios de esquema dentro de la familia A para 2018+ (mismas columnas en todos los meses).
- **Pendiente de la Fase 1:** estimar *N* (registro tardío). Requiere comparar cargas sucesivas; hoy hay una sola. Se guardará una instantánea por corrida desde la Fase 2 y se estimará con las primeras semanas de ingesta. Mientras tanto, regla provisional: marcar las últimas 8 semanas como provisionales.

## 2026-11-09 · D6 · Fase 2 (parte local)
- Validaciones (`validaciones.py`): esquemas pandera para silver y gold mensual; frescura (último hecho ≤ 60 días); caída > 50 % semana contra semana por delito,
  vigilando solo las últimas 8 semanas y sin comparar las 2 últimas (provisionales); conciliación silver = gold. Si falla: código 1, reporte en `data/validacion_reporte.md`.
  Probado con datos reales (OK) y con `FORZAR_FALLO=1` (sale con 1). 5 pruebas con datos sintéticos.
- Por qué solo las semanas recientes: una caída histórica (p. ej. confinamiento de 2020) es real y no debe bloquear publicaciones.
- Publicación (`publicar.py`): sin variables R2_* corre en simulación. Sube `gold/*` y una instantánea semanal `snapshots/semanal_AAAA-MM-DD.parquet`;
  las instantáneas permiten estimar *N* (registro tardío) cuando haya 4-8 corridas.
- `ingesta.yml`: lunes 11:00 UTC y `workflow_dispatch` con `forzar_fallo` y `solo_simulacion`. Bronze se conserva con `actions/cache` (el caché de GitHub se borra a los 7 días sin uso;
  si se pierde, la corrida descarga todo, ~10 min). Si cualquier paso falla se abre un issue y no se publica.
- Secrets de GitHub que debe cargar el autor: `SOCRATA_APP_TOKEN` (opcional), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `VERCEL_DEPLOY_HOOK`.
- Pendiente (acciones hacia afuera, requieren confirmación): crear repo en GitHub y push, bucket de R2 y CORS, proyecto en Vercel y su deploy hook, corrida manual en Actions.
