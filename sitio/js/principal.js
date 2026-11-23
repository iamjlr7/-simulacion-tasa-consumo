/* Arranque de TasaViva.
   Aquí se arma la aplicación: se crea el almacén con el estado inicial, se
   encienden las fuentes en vivo, se monta la carcasa y el enrutador decide
   qué vista mostrar. Cada pieza vive en su carpeta:

   nucleo/      estado, datos del estudio, formato y utilidades de interfaz
   dominio/     el modelo y las cuentas, como funciones puras
   servicios/   lo que habla con el exterior: fuentes en vivo y Excel
   graficos/    dibujo en SVG
   aplicacion/  carcasa y rutas
   vistas/      una por sección, cargadas cuando se abren */

import { montarCarcasa } from "./aplicacion/carcasa.js";
import { crearEnrutador } from "./aplicacion/enrutador.js";
import { CONDICIONES_BASE } from "./dominio/modelo.js";
import { crearAlmacen } from "./nucleo/almacen.js";
import { PREDICCIONES, PREDICCION_POR_DEFECTO, PRINCIPAL, Y0 } from "./nucleo/datos.js";
import { activarTips, leerPreferencia } from "./nucleo/dom.js";
import { iniciarFuentes, vivoInicial } from "./servicios/fuentes.js";

const guardada = leerPreferencia("prediccion");

const almacen = crearAlmacen({
  // Predicción elegida: optimista, conservadora o pesimista.
  tipo: PREDICCIONES.some((p) => p.id === guardada) ? guardada : PREDICCION_POR_DEFECTO,
  // Lo que se ajusta en el simulador.
  sim: { modelo: PRINCIPAL, h: 12, condiciones: { ...CONDICIONES_BASE }, umbral: Math.ceil(Y0) + 2 },
  // Calculadora de cuota.
  credito: { monto: 10_000_000, plazo: 36, cuando: 6 },
  // Preferencias de las vistas que conviene conservar al navegar.
  historia: { anios: 0, series: ["y", "pol", "usura"] },
  mercado: { orden: "monto" },
  // Datos en vivo, con su estado: cargando, vivo o guardado.
  vivo: vivoInicial(),
});

const tema = leerPreferencia("tema");
if (tema) document.documentElement.dataset.theme = tema;

activarTips();
const carcasa = montarCarcasa(almacen);
const enrutador = crearEnrutador({
  contenedor: document.querySelector("#contenido"),
  contexto: { almacen, navegar: (id) => enrutador.navegar(id) },
  alCambiar: (ruta) => carcasa.marcarRuta(ruta),
});
enrutador.iniciar();
iniciarFuentes(almacen);

// Los gráficos se dibujan al ancho real: al cambiar el ancho se rehacen.
let espera = null;
let ancho = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth === ancho) return;
  ancho = window.innerWidth;
  clearTimeout(espera);
  espera = setTimeout(() => enrutador.redibujar(), 150);
});

// Trabajador de servicio: deja la aplicación disponible sin conexión.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* sin modo sin conexión */ });
}

// Acceso para pruebas y para curiosear desde la consola del navegador.
window.TasaViva = { almacen };
