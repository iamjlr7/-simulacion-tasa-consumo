/* Puerta única a los resultados del estudio.
   `datos.js` lo genera Python (`python -m src.analisis`) y deja todo en
   `window.DATOS`. El resto de la aplicación lo lee desde aquí, no del global. */

const fuente = globalThis.window?.DATOS ?? globalThis.DATOS;
if (!fuente) {
  throw new Error("No se encontró datos.js. Genera el archivo con `python -m src.analisis`.");
}

export const D = fuente;
export const P = D.panel;
export const N = P.fecha.length;
export const Y0 = P.y[N - 1];
export const ORIGEN = D.meta.origen;
export const FECHAS = D.meta.fechas_proyeccion;
export const HMAX = D.meta.horizonte_max;
export const PRINCIPAL = "ridge_agregados";
export const AVISO = "Proyección estadística con fines académicos. No es asesoría financiera ni una tasa oficial.";

// Las tres predicciones están vistas por quien pide el crédito: la tasa baja
// es la buena noticia. Python las define; aquí hay un respaldo por si el
// archivo de datos es anterior a esa definición.
export const PREDICCIONES = D.meta.predicciones ?? [
  { id: "optimista", nombre: "Optimista", resumen: "La tasa termina en la parte baja de lo probable.", detalle: "Borde inferior del rango del 80 %." },
  { id: "conservadora", nombre: "Conservadora", resumen: "Lo más probable según los datos de hoy.", detalle: "Proyección central del modelo." },
  { id: "pesimista", nombre: "Pesimista", resumen: "La tasa termina en la parte alta de lo probable.", detalle: "Borde superior del rango del 80 %." },
];
export const PREDICCION_POR_DEFECTO = D.meta.prediccion_por_defecto ?? "conservadora";
export const prediccion = (id) => PREDICCIONES.find((p) => p.id === id) ?? PREDICCIONES.find((p) => p.id === PREDICCION_POR_DEFECTO);
