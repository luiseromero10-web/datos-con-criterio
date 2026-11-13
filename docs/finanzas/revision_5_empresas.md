# Revisión independiente de 5 empresas (corte 2024)

Cada indicador se recalculó **sin usar el código del pipeline**: las cifras se bajaron de nuevo de la API de datos.gov.co (estado individual, periodo actual) y las fórmulas se escribieron aparte (`notebooks/finanzas/fase3/revision_independiente.py`). Los percentiles se recalcularon contando pares en las tablas publicadas. Valores en pesos corrientes; razones en veces o fracción.

## Jerónimo Martins Colombia (comercio al por menor) — NIT 900480569

Grupo de pares: `ciiu4_tercil:4711:T3` (85 sociedades publicadas; 85 al recrearlo).

| Cifra del estado (miles de millones de pesos) | Valor |
|---|---|
| activo | 8,203.244 |
| activo_corr | 1,750.272 |
| pasivo | 8,158.228 |
| pasivo_corr | 4,659.228 |
| patrimonio | 45.015 |
| inventarios | 924.918 |
| cxc | 14.307 |
| cxp | 1,926.160 |
| ingresos | 13,797.871 |
| costo | 11,544.307 |
| operacional | -45.329 |
| costos_fin | 555.968 |
| neta | -601.297 |
| flujo_op | 295.981 |

| Indicador | Recalculado | En gold | Diferencia | Percentil recalculado | Percentil en gold |
|---|---|---|---|---|---|
| margen_neto | -0.0436 | -0.0436 | 0.0e+00 | 5 | 5 |
| margen_operacional | -0.0033 | -0.0033 | 0.0e+00 | 7 | 7 |
| roa | -0.0733 | -0.0733 | 0.0e+00 | 4 | 4 |
| roe | -13.3576 | -13.3576 | 0.0e+00 | 0 | 0 |
| razon_corriente | 0.3757 | 0.3757 | 0.0e+00 | 2 | 2 |
| prueba_acida | 0.1771 | 0.1771 | 0.0e+00 | 6 | 6 |
| endeudamiento | 0.9945 | 0.9945 | 0.0e+00 | 1 | 1 |
| apalancamiento | 181.2317 | 181.2317 | 0.0e+00 | 0 | 0 |
| dias_cartera | 0.3785 | 0.3785 | 0.0e+00 | 98 | 98 |
| flujo_operacion_ingresos | 0.0215 | 0.0215 | 0.0e+00 | 64 | 64 |
| dias_inventario | 29.2434 | 29.2434 | 1.2e-16 | 65 | 64 |
| dias_proveedores | 60.9000 | 60.9000 | 1.2e-16 | 79 | 78 |
| cobertura_intereses | -0.0815 | -0.0815 | 0.0e+00 | 5 | 5 |
| crecimiento_real_ingresos | 0.0489 | 0.0489 | 4.5e-15 | 59 | 59 |

## Clínica Centro (salud) — NIT 802021332

Grupo de pares: `ciiu2_tercil:86:T3` (36 sociedades publicadas; 36 al recrearlo).

| Cifra del estado (miles de millones de pesos) | Valor |
|---|---|
| activo | 109.579 |
| activo_corr | 86.726 |
| pasivo | 46.320 |
| pasivo_corr | 46.320 |
| patrimonio | 63.258 |
| inventarios | 6.114 |
| cxc | 78.258 |
| cxp | 42.417 |
| ingresos | 131.257 |
| costo | 109.532 |
| operacional | 10.454 |
| costos_fin | 0.642 |
| neta | 6.377 |

| Indicador | Recalculado | En gold | Diferencia | Percentil recalculado | Percentil en gold |
|---|---|---|---|---|---|
| margen_neto | 0.0486 | 0.0486 | 0.0e+00 | 28 | 28 |
| margen_operacional | 0.0796 | 0.0796 | 0.0e+00 | 25 | 25 |
| roa | 0.0582 | 0.0582 | 0.0e+00 | 36 | 36 |
| roe | 0.1008 | 0.1008 | 0.0e+00 | 26 | 26 |
| razon_corriente | 1.8723 | 1.8723 | 0.0e+00 | 31 | 31 |
| prueba_acida | 1.7403 | 1.7403 | 0.0e+00 | 29 | 29 |
| endeudamiento | 0.4227 | 0.4227 | 0.0e+00 | 56 | 56 |
| apalancamiento | 0.7322 | 0.7322 | 0.0e+00 | 54 | 54 |
| dias_cartera | 217.6204 | 217.6204 | 0.0e+00 | 19 | 19 |
| flujo_operacion_ingresos | (sin dato) | (vacío) | ok | | |
| dias_inventario | 20.3744 | 20.3744 | 0.0e+00 | 15 | 15 |
| dias_proveedores | 141.3485 | 141.3485 | 0.0e+00 | 68 | 68 |
| cobertura_intereses | 16.2740 | 16.2740 | 0.0e+00 | 65 | 65 |
| crecimiento_real_ingresos | 0.1315 | 0.1315 | 0.0e+00 | 69 | 69 |

## Inacar (construcción de edificios) — NIT 800086042

Grupo de pares: `ciiu4_tercil:4111:T3` (405 sociedades publicadas; 405 al recrearlo).

| Cifra del estado (miles de millones de pesos) | Valor |
|---|---|
| activo | 460.516 |
| activo_corr | 381.177 |
| pasivo | 228.260 |
| pasivo_corr | 151.403 |
| patrimonio | 232.256 |
| inventarios | 247.565 |
| cxc | 91.291 |
| cxp | 33.715 |
| ingresos | 264.071 |
| costo | 187.893 |
| operacional | 29.900 |
| costos_fin | 16.598 |
| neta | 14.102 |
| flujo_op | -67.193 |

| Indicador | Recalculado | En gold | Diferencia | Percentil recalculado | Percentil en gold |
|---|---|---|---|---|---|
| margen_neto | 0.0534 | 0.0534 | 0.0e+00 | 56 | 56 |
| margen_operacional | 0.1132 | 0.1132 | 0.0e+00 | 66 | 66 |
| roa | 0.0306 | 0.0306 | 0.0e+00 | 57 | 57 |
| roe | 0.0607 | 0.0607 | 0.0e+00 | 37 | 37 |
| razon_corriente | 2.5176 | 2.5176 | 0.0e+00 | 54 | 54 |
| prueba_acida | 0.8825 | 0.8825 | 0.0e+00 | 42 | 42 |
| endeudamiento | 0.4957 | 0.4957 | 0.0e+00 | 77 | 77 |
| apalancamiento | 0.9828 | 0.9828 | 0.0e+00 | 76 | 76 |
| dias_cartera | 126.1827 | 126.1827 | 0.0e+00 | 49 | 49 |
| flujo_operacion_ingresos | -0.2545 | -0.2545 | 0.0e+00 | 14 | 14 |
| dias_inventario | 480.9177 | 480.9177 | 1.2e-16 | 39 | 38 |
| dias_proveedores | 65.4939 | 65.4939 | 0.0e+00 | 43 | 43 |
| cobertura_intereses | 1.8014 | 1.8014 | 0.0e+00 | 29 | 29 |
| crecimiento_real_ingresos | 0.1345 | 0.1345 | 0.0e+00 | 57 | 57 |

## Oleoducto de Colombia (transporte por tuberías) — NIT 800068713

Grupo de pares: `ciiu2_tercil:49:T3` (54 sociedades publicadas; 54 al recrearlo).

| Cifra del estado (miles de millones de pesos) | Valor |
|---|---|
| activo | 790.822 |
| activo_corr | 225.391 |
| pasivo | 338.749 |
| pasivo_corr | 243.532 |
| patrimonio | 452.073 |
| inventarios | 3.818 |
| cxc | 81.727 |
| cxp | 165.313 |
| ingresos | 487.967 |
| costo | 143.418 |
| operacional | 317.989 |
| neta | 207.084 |
| flujo_op | 354.006 |

| Indicador | Recalculado | En gold | Diferencia | Percentil recalculado | Percentil en gold |
|---|---|---|---|---|---|
| margen_neto | 0.4244 | 0.4244 | 0.0e+00 | 91 | 91 |
| margen_operacional | 0.6517 | 0.6517 | 0.0e+00 | 93 | 93 |
| roa | 0.2619 | 0.2619 | 0.0e+00 | 96 | 96 |
| roe | 0.4581 | 0.4581 | 0.0e+00 | 96 | 96 |
| razon_corriente | 0.9255 | 0.9255 | 0.0e+00 | 24 | 24 |
| prueba_acida | 0.9098 | 0.9098 | 0.0e+00 | 26 | 26 |
| endeudamiento | 0.4284 | 0.4284 | 0.0e+00 | 56 | 56 |
| apalancamiento | 0.7493 | 0.7493 | 0.0e+00 | 52 | 52 |
| dias_cartera | 61.1317 | 61.1317 | 1.2e-16 | 54 | 54 |
| flujo_operacion_ingresos | 0.7255 | 0.7255 | 0.0e+00 | 92 | 92 |
| dias_inventario | 9.7165 | 9.7165 | 0.0e+00 | 27 | 27 |
| dias_proveedores | 420.7230 | 420.7230 | 0.0e+00 | 90 | 90 |
| cobertura_intereses | (sin dato) | (vacío) | ok | | |
| crecimiento_real_ingresos | 0.0511 | 0.0511 | 4.3e-15 | 58 | 57 |

## Ingenio San Carlos (elaboración de azúcar) — NIT 891900129

Grupo de pares: `ciiu2_tercil:10:T3` (299 sociedades publicadas; 299 al recrearlo).

| Cifra del estado (miles de millones de pesos) | Valor |
|---|---|
| activo | 710.844 |
| activo_corr | 125.406 |
| pasivo | 300.536 |
| pasivo_corr | 120.827 |
| patrimonio | 410.307 |
| inventarios | 48.803 |
| cxc | 39.709 |
| cxp | 46.934 |
| ingresos | 318.661 |
| costo | 260.124 |
| operacional | 26.857 |
| costos_fin | 21.429 |
| neta | 6.708 |
| flujo_op | 37.166 |

| Indicador | Recalculado | En gold | Diferencia | Percentil recalculado | Percentil en gold |
|---|---|---|---|---|---|
| margen_neto | 0.0211 | 0.0211 | 0.0e+00 | 43 | 43 |
| margen_operacional | 0.0843 | 0.0843 | 0.0e+00 | 61 | 61 |
| roa | 0.0094 | 0.0094 | 0.0e+00 | 23 | 23 |
| roe | 0.0163 | 0.0163 | 0.0e+00 | 17 | 17 |
| razon_corriente | 1.0379 | 1.0379 | 0.0e+00 | 25 | 25 |
| prueba_acida | 0.6340 | 0.6340 | 0.0e+00 | 24 | 24 |
| endeudamiento | 0.4228 | 0.4228 | 0.0e+00 | 77 | 77 |
| apalancamiento | 0.7325 | 0.7325 | 0.0e+00 | 77 | 77 |
| dias_cartera | 45.4835 | 45.4835 | 0.0e+00 | 45 | 45 |
| flujo_operacion_ingresos | 0.1166 | 0.1166 | 0.0e+00 | 79 | 79 |
| dias_inventario | 68.4792 | 68.4792 | 0.0e+00 | 25 | 25 |
| dias_proveedores | 65.8563 | 65.8563 | 0.0e+00 | 61 | 61 |
| cobertura_intereses | 1.2533 | 1.2533 | 0.0e+00 | 26 | 26 |
| crecimiento_real_ingresos | -0.0174 | -0.0174 | 0.0e+00 | 63 | 63 |

**Resultado:** sin diferencias (tolerancia relativa 1e-6 en los indicadores y ±1 punto en los percentiles).
