/* La consulta: una foto en datos planos de lo que la persona tiene en pantalla.
   Es lo que se vuelca al Excel. Se arma solo con el estado del almacén, sin
   leer la pantalla, para que se pueda probar fuera del navegador. */

import { AVISO, D, FECHAS, N, ORIGEN, P, PREDICCIONES, PRINCIPAL, Y0, prediccion } from "../nucleo/datos.js";
import { isoDia } from "../nucleo/formato.js";
import { casosCredito } from "./credito.js";
import { promedioSistema, ultimo } from "./mercado.js";
import {
  CONDICIONES_BASE, condicionesActivas, condicionesDe, futurosEn, margenError, rmse, sendaCentral, sendaPrediccion,
} from "./modelo.js";

const SUPERFINANCIERA = "Superintendencia Financiera · datos.gov.co";

function indicadores(vivo) {
  const estado = (clave) => (vivo[clave].estado === "vivo" ? "En vivo" : "Guardado");
  const filas = [
    { nombre: "Tasa de crédito de consumo (la que se proyecta)", valor: Y0, formato: "tasa", unidad: "efectiva anual", fecha: ORIGEN, fuente: "Banco de la República", estado: "Guardado" },
    { nombre: "Tasa de política monetaria", valor: D.politica.valor, formato: "tasa", unidad: "anual", fecha: D.politica.fecha, fuente: "Banco de la República", estado: "Guardado" },
    { nombre: "Inflación anual", valor: P.inflacion[N - 1], formato: "tasa", unidad: "anual", fecha: ORIGEN, fuente: "Banco de la República y DANE", estado: "Guardado" },
    { nombre: "Meta de inflación", valor: P.meta[N - 1], formato: "tasa", unidad: "anual", fecha: ORIGEN, fuente: "Banco de la República", estado: "Guardado" },
  ];
  if (vivo.usura.usura) {
    filas.push(
      { nombre: "Tope legal para consumo (tasa de usura)", valor: vivo.usura.usura, formato: "tasa", unidad: "efectiva anual", fecha: vivo.usura.desde, fuente: SUPERFINANCIERA, estado: estado("usura") },
      { nombre: "Interés bancario corriente", valor: vivo.usura.ibc, formato: "tasa", unidad: "efectiva anual", fecha: vivo.usura.desde, fuente: SUPERFINANCIERA, estado: estado("usura") },
    );
  }
  if (vivo.bancos.entidades.length) {
    filas.push({ nombre: "Libre inversión, promedio de la semana", valor: promedioSistema(vivo.bancos.entidades).tasa, formato: "tasa", unidad: "efectiva anual", fecha: vivo.bancos.corte, fuente: SUPERFINANCIERA, estado: estado("bancos") });
  }
  const trm = ultimo(vivo.trm.serie);
  if (trm) filas.push({ nombre: "Dólar (TRM)", valor: trm[1], formato: "trm", unidad: "pesos por dólar", fecha: isoDia(trm[0]), fuente: SUPERFINANCIERA, estado: estado("trm") });
  const fed = ultimo(vivo.fed.serie);
  if (fed) filas.push({ nombre: "Tasa de fondos federales de EE. UU. (EFFR)", valor: fed[1], formato: "tasa", unidad: "anual", fecha: isoDia(fed[0]), fuente: "Reserva Federal de Nueva York", estado: estado("fed") });
  return filas;
}

export function construirConsulta(estado, ahora = new Date()) {
  const { tipo, sim, credito, vivo } = estado;
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const elegida = prediccion(tipo);
  const condiciones = condicionesDe(sim.modelo, sim.condiciones);
  const sendas = Object.fromEntries(PREDICCIONES.map((p) => [p.id, sendaPrediccion(sim.modelo, p.id, condiciones)]));
  const central = sendaCentral(sim.modelo, condiciones);
  const minimo = margenError(sim.modelo, 0.025);
  const maximo = margenError(sim.modelo, 0.975);
  const i = sim.h - 1;
  const futuros = futurosEn(sim.modelo, sim.h, condiciones);
  const suben = futuros.filter((v) => v > Y0).length;

  return {
    generado: local,
    proyecto: { nombre: D.meta.nombre, lema: D.meta.lema, derechos: D.meta.derechos, aviso: AVISO },
    origen: { fecha: ORIGEN, tasa: Y0 },
    prediccion: { id: elegida.id, nombre: elegida.nombre, resumen: elegida.resumen, detalle: elegida.detalle },
    modelo: { id: sim.modelo, nombre: D.nombres[sim.modelo] },
    plazo: { meses: sim.h, fecha: FECHAS[i] },
    condiciones: {
      activas: condicionesActivas(sim.modelo, sim.condiciones),
      politica: P.pol[N - 1] + condiciones.dPol / 100,
      politicaReal: P.pol[N - 1],
      m2: condiciones.m2,
      m2Real: CONDICIONES_BASE.m2,
      inflacion: condiciones.inf,
      inflacionReal: CONDICIONES_BASE.inf,
    },
    resultado: {
      tasa: sendas[elegida.id][i],
      cambio: sendas[elegida.id][i] - Y0,
      optimista: sendas.optimista[i],
      conservadora: sendas.conservadora[i],
      pesimista: sendas.pesimista[i],
      probSube: futuros.length ? suben / futuros.length : null,
      suben,
      episodios: futuros.length,
      rmse: rmse(sim.modelo, sim.h),
    },
    senda: FECHAS.map((fecha, h) => ({
      meses: h + 1,
      fecha,
      optimista: sendas.optimista[h],
      conservadora: sendas.conservadora[h],
      pesimista: sendas.pesimista[h],
      min95: central[h] + minimo[h],
      max95: central[h] + maximo[h],
    })),
    credito: {
      monto: credito.monto,
      plazo: credito.plazo,
      cuando: { meses: credito.cuando, fecha: FECHAS[credito.cuando - 1] },
      modelo: D.nombres[PRINCIPAL],
      filas: credito.monto ? casosCredito({ ...credito, tipo: elegida.id, usura: vivo.usura.usura }) : [],
    },
    indicadores: indicadores(vivo),
  };
}
