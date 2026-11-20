# TasaViva

Simulador en tiempo real de la tasa de interés del crédito de consumo en Colombia.

TasaViva proyecta la tasa a 1–24 meses, muestra el abanico de futuros posibles
con una simulación animada y consulta en vivo los indicadores que la rodean:
dólar, tope legal de usura, tasas por entidad y tasa de la Reserva Federal.

La proyección es estadística y tiene fines académicos. No es asesoría
financiera ni una tasa oficial.

## Abrir la página

La página es estática y no necesita instalar nada:

```bash
cd sitio
python -m http.server 8765
```

Luego abre <http://localhost:8765>. También funciona con doble clic sobre
`sitio/index.html`. Sin conexión usa los datos guardados y lo indica.

## Qué hay en la página

| Sección | Qué responde |
| --- | --- |
| Resumen | Dónde está la tasa hoy y dónde la ve el modelo en 1, 3, 6 y 12 meses |
| Indicadores en tiempo real | Política, usura, libre inversión, TRM, Fed e inflación |
| Simulador | Cómo cambia la proyección si cambian la política, el M2 o la inflación |
| Tu crédito | Cuánto cambiaría la cuota de un crédito si esperas unos meses |
| Mercado en vivo | Qué tasa cobró cada entidad en la semana más reciente |
| Historia | Veinticuatro años de la tasa y de lo que la mueve |
| Confiabilidad | Cuánto se equivoca el modelo y si los datos nuevos ayudan |
| Método | Los cuatro pasos del modelo, las fuentes y sus límites |

## Datos

Seis archivos del Banco de la República (tasas, política, agregados
monetarios, inflación e IPC) forman la serie mensual de mayo de 2002 a
septiembre de 2026. A eso se suman cuatro fuentes abiertas que la página
refresca sola cada cinco minutos:

| Dato | Fuente | Frecuencia |
| --- | --- | --- |
| TRM | Superintendencia Financiera, datos.gov.co (`mcec-87by`) | Diaria |
| Interés bancario corriente y usura | Superintendencia Financiera (`pare-7x5i`) | Mensual |
| Tasas de libre inversión por entidad | Superintendencia Financiera (`qzsc-9esp`) | Semanal |
| Tasa efectiva de fondos federales | Reserva Federal de Nueva York | Diaria |

## Modelo

El modelo principal es un Ridge directo por horizonte: predice cuánto cambia la
tasa en 1 a 24 meses con su variación reciente, el spread frente a la política
y el crecimiento anual de M1, M2 y M3. Se evalúa con un backtest expansivo
desde mayo de 2012 frente a otros catorce modelos.

Los datos nuevos se probaron uno por uno. Ninguno mejora todos los plazos; la
tasa real de política es la que más ayuda y entra en dos candidatos nuevos
(Ridge con tasa real y un combinado). El detalle está en
`docs/informe-modelado.md`.

La simulación no inventa ruido: aplica a la proyección de hoy los errores que
el modelo cometió de verdad en cada uno de los 150 meses en que se puso a
prueba.

## Reproducir el estudio

Python 3.12 o superior, desde `proyecto/`:

```bash
python -m pip install -r requirements.txt
python -m src.fuentes     # opcional: vuelve a bajar los datos abiertos
python -m src.analisis    # backtest, informe, gráficos y sitio/datos.js
python -m pytest
python -m streamlit run app.py
```

## Estructura

```
sitio/      Página (HTML, CSS y JavaScript sin dependencias)
proyecto/   Código Python: carga, modelos, backtest, informe y pruebas
docs/       Informe de modelado
media/      Gráficos del informe
```

---

© 2026 Orlando José León Romero, Leyber David Peñaloza y Johan Cruz. Todos los derechos reservados.
