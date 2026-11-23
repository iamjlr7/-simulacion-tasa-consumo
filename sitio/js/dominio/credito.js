/* Cuentas del crédito: cuota fija mensual y los casos que se comparan. */

import { FECHAS, PREDICCIONES, PRINCIPAL, Y0 } from "../nucleo/datos.js";
import { mesAnio } from "../nucleo/formato.js";
import { sendaPrediccion } from "./modelo.js";

// Cuota fija (sistema francés). La tasa llega como efectiva anual en
// porcentaje y se lleva a su equivalente mensual.
export function cuotaMensual(monto, tasaEA, plazo) {
  const i = (1 + tasaEA / 100) ** (1 / 12) - 1;
  if (i === 0) return monto / plazo;
  return (monto * i) / (1 - (1 + i) ** -plazo);
}

// Los casos de la calculadora: pedirlo hoy, pedirlo después con cada una de
// las tres predicciones y, si se conoce, con el tope legal. La calculadora usa
// siempre el modelo principal con las condiciones reales.
export function casosCredito({ monto, plazo, cuando, tipo, usura }) {
  const cuotaHoy = cuotaMensual(monto, Y0, plazo);
  const caso = (id, nombre, tasa, elegida = false) => {
    const cuota = cuotaMensual(monto, tasa, plazo);
    return {
      id,
      caso: nombre,
      tasa,
      cuota,
      intereses: cuota * plazo - monto,
      total: cuota * plazo,
      diferencia: id === "hoy" ? null : cuota - cuotaHoy,
      elegida,
    };
  };
  const mes = mesAnio(FECHAS[cuando - 1]);
  const filas = [caso("hoy", "Si lo pides hoy", Y0)];
  PREDICCIONES.forEach((p) => {
    const elegida = p.id === tipo;
    filas.push(caso(
      p.id,
      `En ${mes} · predicción ${p.nombre.toLowerCase()}${elegida ? " (la que elegiste)" : ""}`,
      sendaPrediccion(PRINCIPAL, p.id)[cuando - 1],
      elegida,
    ));
  });
  if (usura) filas.push(caso("usura", "Con el tope legal (tasa de usura)", usura));
  return filas;
}
