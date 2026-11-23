# TasaViva

Simulador en tiempo real de la tasa de interés del crédito de consumo en Colombia.

TasaViva proyecta la tasa a 1–24 meses, muestra el abanico de futuros posibles
con una simulación animada y consulta en vivo los indicadores que la rodean:
dólar, tope legal de usura, tasas por entidad y tasa de la Reserva Federal.

La proyección es estadística y tiene fines académicos. No es asesoría
financiera ni una tasa oficial.

## Abrir la página

La página no necesita instalar nada, solo Python para servir los archivos.

En Windows, haz doble clic en `abrir.bat`. En cualquier sistema:

```bash
cd sitio
python -m http.server 8765
```

Luego abre <http://localhost:8765>. La página usa módulos de JavaScript, que el
navegador no carga con doble clic sobre `index.html`: hay que entrar por el
servidor local.

Después de la primera visita funciona sin conexión, con los últimos datos
guardados, y el navegador ofrece instalarla como aplicación.

## Elegir la predicción

La página y la aplicación dejan elegir una sola predicción entre tres y
cambiarla cuando se quiera. Están vistas por quien pide el crédito:

| Predicción | Qué supone | Cómo se calcula |
| --- | --- | --- |
| Optimista | La tasa termina en la parte baja de lo probable | Borde inferior del rango del 80 % |
| Conservadora | Lo más probable con los datos de hoy | Proyección central del modelo |
| Pesimista | La tasa termina en la parte alta de lo probable | Borde superior del rango del 80 % |

El titular, el gráfico, el simulador y la calculadora de cuota usan la
predicción elegida. La optimista y la pesimista no son límites: la tasa puede
salirse de ese rango.

## Descargar la consulta en Excel

El botón «Descargar Excel», en la barra superior, guarda un archivo `.xlsx`
con lo que se haya elegido hasta ese momento:

| Hoja | Contenido |
| --- | --- |
| Resumen | Fecha y hora, predicción elegida, modelo, plazo, resultado, condiciones de partida y avisos |
| Proyección | Mes a mes, de 1 a 24: optimista, conservadora, pesimista y rango del 95 % |
| Crédito | Monto, plazo y la cuota con la tasa de hoy, con cada predicción y con el tope legal |
| Indicadores | Los indicadores del momento, con su fecha, su fuente y si venían en vivo |

Los números van como números y las fechas como fechas, para que se puedan
sumar o graficar. El archivo se genera en el navegador con
`sitio/js/servicios/excel.js`, sin librerías y sin enviar nada a ningún servidor.

## Qué hay en la página

Un menú lateral lleva a siete vistas. La predicción elegida, en la barra
superior, vale para todas.

| Vista | Qué responde |
| --- | --- |
| Resumen | Dónde está la tasa hoy, dónde queda en 1, 3, 6 y 12 meses, y los indicadores en tiempo real |
| Simulador | Cómo cambia la proyección si cambian la política, el M2 o la inflación |
| Tu crédito | Cuánto cambiaría la cuota de un crédito si esperas unos meses |
| Mercado en vivo | Qué tasa cobró cada entidad en la semana más reciente |
| Historia | Veinticuatro años de la tasa y de lo que la mueve |
| Confiabilidad | Cuánto se equivoca el modelo y si los datos nuevos ayudan |
| Método | Los cuatro pasos del modelo, las fuentes, sus límites y cómo está construida la aplicación |

## Arquitectura de la página

La página es una aplicación de una sola página hecha con módulos de
JavaScript, sin librerías ni paso de compilación. Está organizada por capas, y
cada capa solo conoce a las de abajo:

```
sitio/
  index.html              Carcasa: menú, barra superior, zona de contenido
  datos.js                Resultados del estudio (lo genera Python)
  sw.js                   Trabajador de servicio: modo sin conexión
  manifest.webmanifest    Permite instalarla como aplicación
  estilos/
    tokens.css            Colores, sombras y medidas, en claro y oscuro
    base.css              Estructura general
    componentes.css       Tarjetas, botones, campos, tablas, gráficos
    vistas.css            Lo propio de cada vista
  js/
    principal.js          Arranque: arma todo lo demás
    nucleo/               Almacén de estado, datos, formato, utilidades
    dominio/              El modelo y las cuentas, como funciones puras
    servicios/            Fuentes en vivo y descarga en Excel
    graficos/             Dibujo en SVG
    aplicacion/           Carcasa y rutas
    vistas/               Una por sección
  pruebas/                Pruebas que corren con Node
```

Las ideas que la sostienen:

- **Un solo estado.** Lo que la persona elige (predicción, modelo, plazo,
  crédito) y lo que llega en vivo vive en un almacén (`nucleo/almacen.js`).
  Las vistas no se hablan entre sí: cambian el almacén y se enteran de los
  cambios por suscripción. Cada vista se redibuja solo si cambió su parte.
- **Rutas y carga por demanda.** Cada vista tiene su dirección (`#/simulador`,
  `#/credito`…) y su módulo, que el navegador descarga la primera vez que se
  abre. Al salir de una vista se cancelan sus suscripciones y animaciones.
- **El modelo aparte de la pantalla.** `dominio/` no toca el navegador: son
  funciones que reciben números y devuelven números, y por eso se pueden
  probar solas.
- **Fallar sin romperse.** Si una fuente en vivo no responde, se usa el dato
  guardado y se marca como tal. Si una vista falla, el error se queda en su
  recuadro y el resto sigue funcionando.
- **Sin conexión.** El trabajador de servicio guarda la aplicación y la sirve
  cuando no hay red. Las consultas en vivo no se guardan, para no mostrar un
  dato viejo como si fuera de ahora.

Las pruebas de la página corren con Node 18 o superior, desde `sitio/`:

```bash
node --test pruebas/
```

Comprueban, entre otras cosas, que la cuenta del navegador reproduce la
proyección del estudio y que el Excel se arma bien.

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
el modelo cometió de verdad en cada uno de los 173 meses en que se puso a
prueba. Los más recientes aún no completan 24 meses de resultado y solo
aportan a los plazos que ya se pueden comparar.

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
abrir.bat   Abre la página en Windows con doble clic
sitio/      Aplicación web (HTML, CSS y módulos de JavaScript, sin dependencias)
proyecto/   Código Python: carga, modelos, backtest, informe y pruebas
docs/       Informe de modelado
media/      Gráficos del informe
```

---

© 2026 Orlando José León Romero, Leyber David Peñaloza y Johan Cruz. Todos los derechos reservados.
