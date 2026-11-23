/* Trabajador de servicio de TasaViva.
   Guarda una copia de la aplicación para que abra sin conexión y se pueda
   instalar. Estrategia: primero la red, y la copia solo si la red falla. Así,
   con conexión siempre se ve la versión más reciente.

   Las consultas a las fuentes en vivo (datos.gov.co, Fed) NO pasan por aquí:
   si se guardaran, un dato viejo podría mostrarse como si fuera de ahora. */

const VERSION = "tasaviva-v1";

const APLICACION = [
  "./",
  "index.html",
  "datos.js",
  "icono.svg",
  "manifest.webmanifest",
  "estilos/tokens.css",
  "estilos/base.css",
  "estilos/componentes.css",
  "estilos/vistas.css",
  "js/principal.js",
  "js/aplicacion/carcasa.js",
  "js/aplicacion/enrutador.js",
  "js/aplicacion/rutas.js",
  "js/dominio/consulta.js",
  "js/dominio/credito.js",
  "js/dominio/mercado.js",
  "js/dominio/modelo.js",
  "js/graficos/chispa.js",
  "js/graficos/histograma.js",
  "js/graficos/lineas.js",
  "js/nucleo/almacen.js",
  "js/nucleo/datos.js",
  "js/nucleo/dom.js",
  "js/nucleo/formato.js",
  "js/nucleo/iconos.js",
  "js/servicios/excel.js",
  "js/servicios/fuentes.js",
  "js/vistas/confianza.js",
  "js/vistas/credito.js",
  "js/vistas/historia.js",
  "js/vistas/mercado.js",
  "js/vistas/metodo.js",
  "js/vistas/resumen.js",
  "js/vistas/simulador.js",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(VERSION).then((copia) => copia.addAll(APLICACION)).then(() => self.skipWaiting()),
  );
});

// Al activarse una versión nueva se borran las copias de las anteriores.
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((nombre) => nombre !== VERSION).map((nombre) => caches.delete(nombre))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const destino = new URL(pedido.url);
  // Solo se atienden los archivos propios. Lo demás sigue directo a la red.
  if (pedido.method !== "GET" || destino.origin !== self.location.origin) return;
  evento.respondWith(
    fetch(pedido)
      .then((respuesta) => {
        if (respuesta.ok) {
          const duplicado = respuesta.clone();
          caches.open(VERSION).then((copia) => copia.put(pedido, duplicado));
        }
        return respuesta;
      })
      .catch(() => caches.match(pedido, { ignoreSearch: true }).then((guardado) => guardado ?? caches.match("index.html"))),
  );
});
