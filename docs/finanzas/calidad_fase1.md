# Calidad de la Fase 1 — ingesta y transformación

Generado por `pipelines/finanzas/calidad.py` sobre `finanzas/`. Pesos corrientes; fuente en miles de pesos (×1 000).

## Resumen de criterios

| Criterio | Resultado |
|---|---|
| Conciliación con `6cat-2gcs` (mediana del error < 1 %, activos ≥ 0.5 billones) | cumple |
| ≥ 95 % de los informes individuales con las 8 variables núcleo, cada año | cumple |
| Identidad activo = pasivo + patrimonio ≥ 99 % (±3,000 pesos), cada año | cumple |
| Sin datos de contacto en bronze, silver ni gold | cumple |

## Informes por año

| Año | Informes (individual+separado) | NIT | Elegidos | Individual | Separado | Descartados | Individuales (Fase 0) | Filas repetidas en la fuente | Claves con valores distintos |
|---|---|---|---|---|---|---|---|---|---|
| 2016 | 23,154 | 23,150 | 23,150 | 20,284 | 2,866 | 4 | 20,284 | 28 (0.0 %) | 0 |
| 2017 | 19,810 | 19,808 | 19,808 | 17,103 | 2,705 | 2 | 17,103 | 0 (0.0 %) | 0 |
| 2018 | 19,405 | 19,405 | 19,405 | 16,720 | 2,685 | 0 | 16,717 | 0 (0.0 %) | 0 |
| 2019 | 25,604 | 25,597 | 25,597 | 22,485 | 3,112 | 7 | 22,481 | 0 (0.0 %) | 0 |
| 2020 | 30,000 | 29,924 | 29,924 | 26,729 | 3,195 | 76 | 26,725 | 0 (0.0 %) | 0 |
| 2021 | 29,230 | 29,143 | 29,143 | 26,074 | 3,069 | 87 | 26,070 | 0 (0.0 %) | 0 |
| 2022 | 31,204 | 31,111 | 31,111 | 27,753 | 3,358 | 93 | 27,749 | 751,871 (48.4 %) | 0 |
| 2023 | 31,454 | 31,371 | 31,371 | 27,873 | 3,498 | 83 | 27,870 | 0 (0.0 %) | 0 |
| 2024 | 29,425 | 29,348 | 29,348 | 25,867 | 3,481 | 77 | 25,866 | 0 (0.0 %) | 0 |
| 2025 | 29,167 | 29,165 | 29,165 | 25,615 | 3,550 | 2 | 25,613 | 0 (0.0 %) | 0 |

«Individuales (Fase 0)» son los NIT con estado individual contados en la Fase 0 directamente contra la API; deben coincidir con «Individual» (cuando no hay informes individuales repetidos).

## Variables núcleo (informes individuales)

| Año | Informes | Las 8 | activo_total | pasivo_total | patrimonio | activo_corriente | pasivo_corriente | ingresos | ganancia_operacional | ganancia_neta |
|---|---|---|---|---|---|---|---|---|---|---|
| 2016 | 20,284 | **98.9 %** | 100.0 % | 100.0 % | 100.0 % | 99.9 % | 99.7 % | 99.3 % | 99.7 % | 99.7 % |
| 2017 | 17,103 | **98.9 %** | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 99.7 % | 99.2 % | 99.8 % | 99.8 % |
| 2018 | 16,720 | **99.0 %** | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 99.7 % | 99.3 % | 100.0 % | 100.0 % |
| 2019 | 22,485 | **98.8 %** | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 99.5 % | 99.4 % | 100.0 % | 100.0 % |
| 2020 | 26,729 | **95.9 %** | 97.1 % | 97.1 % | 97.1 % | 97.1 % | 96.5 % | 99.4 % | 100.0 % | 100.0 % |
| 2021 | 26,074 | **98.5 %** | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 99.1 % | 99.4 % | 100.0 % | 100.0 % |
| 2022 | 27,753 | **98.5 %** | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 99.1 % | 99.4 % | 100.0 % | 100.0 % |
| 2023 | 27,873 | **98.5 %** | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 99.0 % | 99.4 % | 100.0 % | 100.0 % |
| 2024 | 25,867 | **98.8 %** | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 99.3 % | 99.5 % | 100.0 % | 100.0 % |
| 2025 | 25,615 | **98.8 %** | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 99.3 % | 99.4 % | 100.0 % | 100.0 % |

## Identidad contable

| Año | Informes con las 3 cifras | Cumple (±3,000 pesos) | Cumple (±0,1 % del activo) | Sin las 3 cifras |
|---|---|---|---|---|
| 2016 | 23,150 | **100.0 %** | 100.0 % | 0 |
| 2017 | 19,808 | **100.0 %** | 100.0 % | 0 |
| 2018 | 19,405 | **100.0 %** | 100.0 % | 0 |
| 2019 | 25,597 | **100.0 %** | 100.0 % | 0 |
| 2020 | 29,003 | **100.0 %** | 100.0 % | 921 |
| 2021 | 29,143 | **100.0 %** | 100.0 % | 0 |
| 2022 | 31,111 | **100.0 %** | 100.0 % | 0 |
| 2023 | 31,371 | **100.0 %** | 100.0 % | 0 |
| 2024 | 29,348 | **100.0 %** | 100.0 % | 0 |
| 2025 | 29,165 | **100.0 %** | 100.0 % | 0 |

## Conciliación con `6cat-2gcs` (Supersociedades, activos ≥ 0.5 billones)

`6cat-2gcs` suma «ingresos operacionales» con una definición que no documenta; se compara con los ingresos de actividades ordinarias y con ordinarios + otros ingresos.

| Año | En 6cat | Cruzan por NIT | Grandes | Grandes que cruzan | Mediana error activos | Mediana error ingresos ordinarios | Mediana error ordinarios + otros | Mediana error patrimonio | >5 % activos | >5 % ordinarios | >5 % ordinarios + otros | >5 % patrimonio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2021 | 8,818 | 8,811 | 408 | 405 | **0.2 %** | 1.8 % | **0.6 %** | 0.2 % | 0 | 116 | 68 | 0 |
| 2022 | 8,960 | 8,917 | 469 | 467 | **0.2 %** | 1.7 % | **0.6 %** | 0.2 % | 0 | 141 | 83 | 0 |
| 2023 | 8,536 | 8,460 | 466 | 462 | **0.2 %** | 1.6 % | **0.5 %** | 0.2 % | 0 | 131 | 75 | 0 |
| 2024 | 8,520 | 8,490 | 525 | 520 | **0.2 %** | 1.6 % | **0.5 %** | 0.2 % | 0 | 135 | 69 | 1 |
| 2025 | 8,916 | 8,821 | 530 | 507 | **0.2 %** | 1.7 % | **0.5 %** | 0.2 % | 0 | 144 | 79 | 0 |

### Por tipo de estado (todos los años, activos ≥ 0,5 billones)

| Estado usado | Casos | Mediana error ordinarios + otros | >5 % ordinarios + otros | De ellos, 6cat mayor que lo propio |
|---|---|---|---|---|
| individual | 1,034 | 0.3 % | 72 (7.0 %) | 43 |
| separado | 1,327 | 1.0 % | 302 (22.8 %) | 268 |

Hipótesis (no verificada): en los estados separados, `6cat-2gcs` parece informar ingresos de un perímetro mayor (grupo); los activos y el patrimonio, que no cambian de definición, concilian en todos los casos.

### Casos con diferencia mayor al 5 % (los 25 más grandes)

| Año | NIT | Razón social | Estado usado | Activos 6cat (bill.) | Activos propios | Ingresos 6cat | Ordinarios + otros | Patrimonio 6cat | Patrimonio propio |
|---|---|---|---|---|---|---|---|---|---|
| 2024 | 900531210 | CENIT TRANSPORTE Y LOGISTICA DE HIDROCAR | separado | 20.46 | 20.46 | 9.98 | 7.11 | 17.47 | 17.47 |
| 2025 | 900531210 | CENIT TRANSPORTE Y LOGISTICA DE HIDROCAR | separado | 19.72 | 19.72 | 9.93 | 7.05 | 16.86 | 16.86 |
| 2023 | 900531210 | CENIT TRANSPORTE Y LOGISTICA DE HIDROCAR | separado | 19.59 | 19.59 | 9.94 | 7.11 | 16.61 | 16.61 |
| 2022 | 900531210 | CENIT TRANSPORTE Y LOGISTICA DE HIDROCAR | separado | 19.56 | 19.56 | 8.53 | 5.70 | 17.21 | 17.21 |
| 2021 | 900531210 | CENIT TRANSPORTE Y LOGISTICA DE HIDROCAR | separado | 19.15 | 19.15 | 8.05 | 5.15 | 16.97 | 16.97 |
| 2024 | 860005224 | BAVARIA & CIA S.C.A | separado | 13.61 | 13.61 | 8.62 | 6.92 | 4.14 | 4.14 |
| 2025 | 860005224 | BAVARIA & CIA S.C.A | separado | 13.55 | 13.55 | 9.34 | 7.50 | 5.12 | 5.12 |
| 2023 | 860005224 | BAVARIA & CIA S.C.A | separado | 12.01 | 12.01 | 8.01 | 6.54 | 2.72 | 2.72 |
| 2022 | 901351676 | GRUPO BICENTENARIO SAS | separado | 11.72 | 11.72 | 1.31 | 0.00 | 11.69 | 11.69 |
| 2022 | 901421912 | JGDB HOLDING SAS | separado | 10.80 | 10.80 | 3.09 | 0.00 | 5.19 | 5.19 |
| 2022 | 860005224 | BAVARIA & CIA S.C.A | separado | 10.68 | 10.68 | 6.96 | 5.98 | 3.15 | 3.15 |
| 2021 | 860005224 | BAVARIA & CIA S.C.A | separado | 10.25 | 10.25 | 6.00 | 4.92 | 3.79 | 3.79 |
| 2024 | 800249942 | Colombiana de Licitaciones y Concesiones | separado | 10.15 | 10.15 | 0.21 | 0.12 | 7.33 | 7.33 |
| 2023 | 800249942 | Colombiana de Licitaciones y Concesiones | separado | 9.88 | 9.88 | 0.96 | 0.12 | 7.33 | 7.33 |
| 2025 | 800249942 | Colombiana de Licitaciones y Concesiones | separado | 9.83 | 9.83 | 0.11 | 0.08 | 7.31 | 7.31 |
| 2022 | 800251163 | OLEODUCTO CENTRAL S.A. | individual | 8.71 | 8.71 | 5.52 | 1.63 | 4.88 | 4.88 |
| 2021 | 830113601 | ACTIUNIDOS S.A | separado | 8.24 | 8.24 | 0.85 | 0.00 | 7.95 | 7.95 |
| 2024 | 900480569 | JERONIMO MARTINS COLOMBIA SAS | individual | 8.20 | 8.20 | 13.83 | 13.83 | 0.05 | 0.05 |
| 2022 | 830078038 | CERREJON ZONA NORTE S.A.CERREJON ZONA NO | individual | 7.95 | 7.95 | 7.20 | 3.28 | 4.59 | 4.59 |
| 2025 | 830113601 | ACTIUNIDOS S.A.S. | separado | 7.80 | 7.80 | 0.46 | 0.00 | 7.49 | 7.49 |
| 2024 | 800251163 | OLEODUCTO CENTRAL S.A. | separado | 7.75 | 7.75 | 5.98 | 1.67 | 4.63 | 4.63 |
| 2024 | 830113601 | Actiunidos S.A.S. | separado | 7.40 | 7.40 | 0.29 | 0.00 | 7.10 | 7.10 |
| 2023 | 830113601 | Actiunidos S.A.S. | separado | 7.10 | 7.10 | 0.23 | 0.00 | 6.79 | 6.79 |
| 2021 | 800251163 | OLEODUCTO CENTRAL S.A. | individual | 7.07 | 7.07 | 4.62 | 1.29 | 3.95 | 3.95 |
| 2023 | 800251163 | OLEODUCTO CENTRAL S.A. | individual | 7.01 | 7.01 | 6.14 | 1.43 | 3.93 | 3.93 |

Grandes de `6cat-2gcs` sin informe en nuestros estados: 37 (de 2398).

## Identidad de las sociedades (gold/empresas_anio)

| Año | Sociedades | Con municipio DIVIPOLA | Con CIIU propio | Con CIIU heredado | Sin CIIU | Con razón social |
|---|---|---|---|---|---|---|
| 2016 | 23,150 | 95.8 % | 0.0 % | 76.5 % | 23.5 % | 100.0 % |
| 2017 | 19,808 | 93.1 % | 0.0 % | 85.3 % | 14.7 % | 100.0 % |
| 2018 | 19,404 | 92.2 % | 0.0 % | 93.1 % | 6.9 % | 100.0 % |
| 2019 | 25,597 | 91.6 % | 0.0 % | 96.3 % | 3.7 % | 100.0 % |
| 2020 | 29,924 | 98.5 % | 100.0 % | 0.0 % | 0.0 % | 100.0 % |
| 2021 | 29,143 | 98.4 % | 100.0 % | 0.0 % | 0.0 % | 100.0 % |
| 2022 | 31,111 | 98.4 % | 100.0 % | 0.0 % | 0.0 % | 100.0 % |
| 2023 | 31,371 | 98.3 % | 100.0 % | 0.0 % | 0.0 % | 100.0 % |
| 2024 | 29,348 | 98.3 % | 100.0 % | 0.0 % | 0.0 % | 100.0 % |
| 2025 | 29,165 | 98.2 % | 100.0 % | 0.0 % | 0.0 % | 100.0 % |

## Datos de contacto

Sin hallazgos.
