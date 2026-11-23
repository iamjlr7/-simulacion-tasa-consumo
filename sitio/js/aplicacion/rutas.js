/* Tabla de rutas.
   Cada sección es una vista con su propio módulo. `cargar` usa import()
   dinámico: el navegador descarga el código de una vista la primera vez que
   se abre, no antes. */

export const RUTAS = [
  { id: "resumen", titulo: "Resumen", bajada: "Dónde está la tasa hoy y hacia dónde va", icono: "resumen", cargar: () => import("../vistas/resumen.js") },
  { id: "simulador", titulo: "Simulador", bajada: "Los futuros posibles de la tasa, en tiempo real", icono: "simulador", cargar: () => import("../vistas/simulador.js") },
  { id: "credito", titulo: "Tu crédito", bajada: "Qué significa la predicción para tu cuota", icono: "credito", cargar: () => import("../vistas/credito.js") },
  { id: "mercado", titulo: "Mercado en vivo", bajada: "Lo que cobran las entidades esta semana", icono: "mercado", cargar: () => import("../vistas/mercado.js") },
  { id: "historia", titulo: "Historia", bajada: "Veinticuatro años de la tasa y de lo que la mueve", icono: "historia", cargar: () => import("../vistas/historia.js") },
  { id: "confianza", titulo: "Confiabilidad", bajada: "Cuánto se equivoca el modelo y por qué creerle", icono: "confianza", cargar: () => import("../vistas/confianza.js") },
  { id: "metodo", titulo: "Método", bajada: "Cómo funciona, sin cajas negras", icono: "metodo", cargar: () => import("../vistas/metodo.js") },
];

export const rutaDe = (hash) => {
  const id = hash.replace(/^#\/?/, "").split("?")[0];
  return RUTAS.find((ruta) => ruta.id === id) ?? RUTAS[0];
};
