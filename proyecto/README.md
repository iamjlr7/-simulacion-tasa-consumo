# TasaViva · código del estudio

Estudio mensual de la tasa de interés del crédito de consumo de libre inversión
en Colombia. El modelo principal es un Ridge directo por horizonte. Usa la
variación reciente de la tasa, el spread frente a la tasa de política, la
variación de la política y el crecimiento anual de M1, M2 y M3.

La proyección es estadística. No es asesoría financiera ni una tasa oficial.

## Instalación

Python 3.12. Desde esta carpeta:

```bash
python3 -m pip install -r requirements.txt
```

Las versiones quedan fijadas en `requirements.txt`.

## Datos

Los CSV viven en `data/raw/`. Se leen con separador `;`, decimal `,` y
codificación `utf-8-sig`. Las fechas usan el formato `AAAA/MM/DD`.

| Archivo | Frecuencia de origen | Uso |
| --- | --- | --- |
| Tasas_de_interes.csv | Semanal, viernes | Objetivo: crédito de consumo |
| Tasas_de_politica_monetaria.csv | Diaria | Promedio mensual de la política |
| Agregados_monetarios_y_crediticios_mensual.csv | Cierre de mes | M1, M2 y M3 |
| Agregados_monetarios_y_crediticios_semanal.csv | Semanal | Extensión, no entra al modelo |
| Inflacion_y_meta.csv | Mensual | Contraste; no mejora el error |
| IPC.csv | Mensual | Control de coherencia de la inflación |

Además, `data/raw/externos/` guarda cuatro fuentes abiertas que baja
`python -m src.fuentes`: la TRM diaria, el interés bancario corriente con su
usura y las tasas de libre inversión por entidad (Superintendencia Financiera,
datos.gov.co), y la tasa efectiva de fondos federales (Reserva Federal de Nueva
York). `fuentes.json` anota la hora de descarga y el rango de cada archivo.

Esas series entran al panel como `trm`, `fed`, `ibc` y `usura`. De ellas salen
la tasa real de política, la depreciación del peso, el diferencial frente a la
Fed y la holgura frente a la usura. El interés bancario corriente publicado
empieza en abril de 2007.

La muestra de estimación va de mayo de 2002 a septiembre de 2026 (293 meses).
Octubre de 2026 se muestra como dato parcial y no se usa para entrenar.

## Decisiones de preparación

La frecuencia de modelado es mensual. La tasa de consumo es el promedio de los
viernes del mes y la política es el promedio de los días. Ambas se fechan al
cierre. El crecimiento de cada agregado es `100 * ln(M_t / M_{t-12})`.

El Ridge de horizonte h predice `y_{t+h} - y_t` con las seis variables de t,
estandarizadas con la media y la desviación de los pares ya observados
(`i + h <= origen`). λ = 5 sobre los coeficientes. El intercepto no se penaliza.
La proyección es la tasa del origen más ese cambio. No se proyectan las
explicativas.

El backtest es expansivo, con 120 meses mínimos y reajuste cada mes. La primera
predicción a un mes es mayo de 2012. Lasso y Elastic Net eligen λ con el tramo
reciente del entrenamiento. El orden del AR y del VAR sale del AIC de ese mismo
origen. No hay validación cruzada aleatoria.

## Reproducir

```bash
python3 -m src.fuentes          # opcional: refresca los datos abiertos
python3 -m src.analisis
python3 -m src.exportar_sitio   # solo si quieres regenerar ../sitio/datos.js
python3 -m pytest
python3 -m streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

`src.analisis` escribe el panel, las métricas, los gráficos en `../media/`, el
informe en `../docs/informe-modelado.md` y el paquete `../sitio/datos.js` que
usa la página. También contrasta cada dato nuevo contra la especificación base
(`data/processed/variables_nuevas.csv`). El cuaderno
`notebooks/flujo_modelado.ipynb` recorre la carga, el Ridge y la lectura de
esos resultados.

## Pruebas

`pytest` comprueba la lectura con punto y coma y coma decimal, que octubre de
2026 no entra al panel, que el escalado de un origen no usa meses futuros, la
forma de la proyección a 24 meses y los RMSE de referencia del Ridge con una
tolerancia de 0,05 puntos porcentuales.

`tests/test_fuentes.py` cubre lo nuevo: que los datos abiertos entran al panel
sin huecos, que la usura es 1,5 veces el interés corriente, que el combinado es
el promedio de sus dos Ridge y que el cálculo que hace el navegador reproduce
la proyección publicada.

## Aplicación

La aplicación, en español, permite recorrer la tasa y los agregados, elegir el
modelo y el horizonte, ver las bandas del 80 % y del 95 % y descargar la senda
en CSV. El aviso de la pantalla fija el alcance: es una proyección estadística,
no una recomendación.

El escenario de la barra lateral cambia las condiciones de septiembre de 2026
en el Ridge con agregados. No construye una senda futura de la política ni del
dinero.

---

© 2026 Orlando José León Romero, Leyber David Peñaloza y Johan Cruz. Todos los derechos reservados.
