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
