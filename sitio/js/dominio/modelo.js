/* El modelo, tal como corre en el navegador.
   Son funciones puras: reciben el modelo, la predicción y las condiciones, y
   devuelven números. No tocan la pantalla ni el almacén, así se pueden probar
   solas (ver pruebas/). */

import { D, P, N, Y0, HMAX } from "../nucleo/datos.js";

// Mismo cuantil que numpy por defecto: interpolación lineal entre vecinos.
export function cuantil(ordenados, q) {
  if (!ordenados.length) return NaN;
  const posicion = (ordenados.length - 1) * q;
  const base = Math.floor(posicion);
  const siguiente = ordenados[Math.min(base + 1, ordenados.length - 1)];
  return ordenados[base] + (siguiente - ordenados[base]) * (posicion - base);
}

// Condiciones reales del mes de origen. `dPol` es el cambio de la tasa de
// política en puntos básicos; `m2` e `inf` son niveles en porcentaje.
export const CONDICIONES_BASE = Object.freeze({
  dPol: 0,
  m2: P.g_m2[N - 1],
  inf: P.inflacion[N - 1],
});

const RIDGE_RECALCULABLES = ["ridge_agregados", "ridge_real", "combinado", "ridge_tasa_politica"];

// Repite en el navegador la cuenta del Ridge directo: para cada plazo,
// cambio = intercepto + Σ coeficiente × (variable − media) / desviación.
function sendaRidge(modelo, condiciones) {
  const ridge = D.ridge[modelo];
  const x = ridge.x_origen.slice();
  const delta = condiciones.dPol / 100;
  const dInflacion = condiciones.inf - CONDICIONES_BASE.inf;
  ridge.columnas.forEach((columna, j) => {
    if (columna === "spread") x[j] -= delta;
    if (columna === "dpol3") x[j] += delta;
    if (columna === "g_m2") x[j] = condiciones.m2;
    if (columna === "tasa_real") x[j] += delta - dInflacion;
  });
  return ridge.ajustes.map((ajuste) => {
    let cambio = ajuste.b0;
    ajuste.coef.forEach((b, j) => { cambio += b * ((x[j] - ajuste.media[j]) / ajuste.desv[j]); });
    return Y0 + cambio;
  });
}

// Proyección central (la predicción conservadora) para los 24 plazos.
export function sendaCentral(modelo, condiciones = CONDICIONES_BASE) {
  if (modelo === "combinado" && D.ridge.ridge_real) {
    const a = sendaRidge("ridge_agregados", condiciones);
    const b = sendaRidge("ridge_real", condiciones);
    return a.map((v, i) => (v + b[i]) / 2);
  }
  if (D.ridge[modelo]) return sendaRidge(modelo, condiciones);
  return D.proyeccion[modelo].central.slice();
}

export const admiteCondiciones = (modelo) =>
  RIDGE_RECALCULABLES.includes(modelo) && (modelo !== "combinado" || !!D.ridge.ridge_real);

export const usaColumna = (modelo, columna) => {
  if (modelo === "combinado") return ["ridge_agregados", "ridge_real"].some((m) => D.ridge[m]?.columnas.includes(columna));
  return !!D.ridge[modelo]?.columnas.includes(columna);
};

// Condiciones que de verdad se aplican: las del usuario si el modelo se puede
// recalcular, las reales si no.
export const condicionesDe = (modelo, condiciones) => (admiteCondiciones(modelo) ? condiciones : CONDICIONES_BASE);

export function condicionesActivas(modelo, condiciones) {
  if (!admiteCondiciones(modelo)) return false;
  return condiciones.dPol !== 0
    || (usaColumna(modelo, "g_m2") && Math.abs(condiciones.m2 - CONDICIONES_BASE.m2) > 1e-9)
    || (usaColumna(modelo, "tasa_real") && Math.abs(condiciones.inf - CONDICIONES_BASE.inf) > 1e-9);
}

export const rmse = (modelo, h) => D.metricas[modelo]?.rmse[h - 1] ?? null;

// Errores del backtest: una fila por mes de origen, una columna por plazo.
// Los orígenes recientes tienen `null` en los plazos que aún no se cumplen.
export const episodios = (modelo) => D.errores[modelo] ?? { origen: [], e: [] };

const cacheMargen = new Map();

// Percentil `q` del error histórico en cada plazo.
export function margenError(modelo, q) {
  const clave = `${modelo}|${q}`;
  if (!cacheMargen.has(clave)) {
    const filas = episodios(modelo).e;
    cacheMargen.set(clave, Array.from({ length: HMAX }, (_, i) => {
      const errores = filas.map((fila) => fila[i]).filter((v) => v !== null).sort((a, b) => a - b);
      return errores.length ? cuantil(errores, q) : 0;
    }));
  }
  return cacheMargen.get(clave);
}

const CUANTIL_PREDICCION = { optimista: 0.1, pesimista: 0.9 };

// Una sola senda por predicción. La conservadora es la central; la optimista y
// la pesimista le suman el percentil 10 o 90 del error (el rango del 80 %).
export function sendaPrediccion(modelo, tipo, condiciones = CONDICIONES_BASE) {
  const central = sendaCentral(modelo, condiciones);
  const q = CUANTIL_PREDICCION[tipo];
  if (q === undefined) return central;
  const margen = margenError(modelo, q);
  return central.map((v, i) => v + margen[i]);
}

// Futuros posibles en un plazo: la proyección central más cada error conocido.
export function futurosEn(modelo, h, condiciones = CONDICIONES_BASE) {
  const central = sendaCentral(modelo, condiciones)[h - 1];
  return episodios(modelo).e.map((fila) => fila[h - 1]).filter((v) => v !== null).map((error) => central + error);
}

export const modelosDisponibles = () => Object.keys(D.nombres).filter((m) => D.proyeccion[m] && D.errores[m]);
