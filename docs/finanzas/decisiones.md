# Registro de decisiones — Radiografía Financiera

## 2026-11-12 · F1 · Fase 0: verificación de fuentes (sin cambios hacia afuera)
Detalle en [`fuentes.md`](fuentes.md) y [`matriz_rubros.md`](matriz_rubros.md). Scripts en `notebooks/finanzas/fase0/`.
- Se crearon las subcarpetas de la sección 7 del plan (`apps/finanzas`, `pipelines/finanzas`, `models/finanzas`, `tests/finanzas`, `notebooks/finanzas`, `docs/finanzas`, `data/finanzas`). El observatorio, `packages/*` y `pipelines/common` no se tocaron.
- Servicios: conectados GitHub (CLI `gh` con sesión del autor), Vercel (conector; la escritura puede dar 403, se usará la CLI con confirmación), Supabase y Claude Docs. **Cloudflare necesita autenticación** (`needs_auth`); para R2 se seguirá usando Wrangler/CLI con la sesión del autor. No se hizo nada hacia afuera.
- Se descargó **un** archivo de la Supersociedades (base de insolvencia, corte noviembre 2026, 793 866 bytes) a `data/finanzas/insolvencia_raw/` (ignorado por git).

## 2026-11-12 · F2 · Hallazgos que cambian el plan
1. **El pico de 2022 es duplicación de filas**, no de informes (32 753 informes reales). Toda la ingesta deduplica por `(codigo_instancia, concepto, periodo)` y registra los descartes. El plan 3.2 cita «93 951 informes»; el dato correcto es 32 753.
2. **Unidades: miles de pesos.** Se guardarán en pesos (×1 000) o se dejarán en miles con la unidad en el nombre de columna; decisión de formato pendiente para la Fase 1 (propuesta: pesos enteros).
3. **CIIU solo existe en la carátula desde el corte 2020.** Los pares de 2016–2019 dependen de heredar el CIIU de otro año.
4. **La base de insolvencia parece una foto de procesos vigentes** (hipótesis, por comprobar con cortes antiguos) y **no tiene licencia abierta**.
5. **`6cat-2gcs` tiene precisión de 0,01 billones**; el criterio «mediana del error < 1 %» del plan solo se puede medir con las 525 empresas de ≥ 0,5 billones de activos.
6. **No hay Grupo 3** y 2015 solo trae Grupo 1 sin flujo de efectivo.
7. **El signo del impuesto está invertido en 2017** («Gasto (ingreso) por impuestos»).

## 2026-11-12 · F3 · Decisiones de la sección 0.3 (pendientes de confirmación del autor)
Propuestas de Claude, a confirmar:
1. **Nombre visible:** «Radiografía Financiera»; ruta `/finanzas`.
2. **Puntajes individuales del modelo:** no publicarlos (ver 0.2 del plan). Además, solo 23–37 % de las empresas admitidas había presentado estados el año anterior, lo que refuerza que el modelo no es una calificación de ninguna empresa en particular.
3. **Alcance:** 2016–2025; estados individuales de Grupo 1 y 2; separado solo si no hay individual (≈ 11–14 % de las sociedades); consolidados y combinados fuera.
4. **Pares:** CIIU-4 × tercil de ingresos si el CIIU-4 tiene ≥ 45 empresas (114 códigos, 85 % de las empresas); si no, CIIU-2. Se propone **subir el mínimo de 15 por grupo** a 15 por *tercil* (45 por CIIU-4). El código L6810 (14 % de las empresas) se trata con atención.
5. **Libro y marco del caso:** los elige el autor.

Decisiones nuevas que surgieron (a confirmar):
6. **Base de insolvencia:** usarla solo para construir la etiqueta y publicar solo agregados, sin listar empresas en proceso.
7. **Comprobar la foto de procesos vigentes:** descargar dos cortes antiguos (diciembre 2019 y diciembre 2022; unos 340 y 450 KB) y comparar con el actual. Requiere el sí del autor para descargar.
8. **CIIU 2016–2019:** heredar del año más cercano con CIIU, marcando el origen.
9. **Separado como respaldo** se marca en la ficha.
10. **Conciliación con `6cat-2gcs`:** medir el error sobre las empresas de ≥ 0,5 billones y reportar aparte las demás.
