/* Datos en vivo.
   Cuatro consultas a fuentes públicas que no piden clave y aceptan llamadas
   desde el navegador. Cada respuesta se guarda en el almacén, en `vivo`; las
   vistas se enteran por suscripción. Si una fuente falla, se conserva el dato
   guardado y se marca como tal: la página nunca se queda sin número. */

import { D } from "../nucleo/datos.js";
import { ms } from "../nucleo/formato.js";

const SOCRATA = "https://www.datos.gov.co/resource/";
const FED = "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/260.json";
export const REFRESCO_MS = 5 * 60 * 1000;
export const FUENTES = ["trm", "usura", "fed", "bancos"];

// Estado de arranque: lo último que descargó el estudio, marcado "cargando".
export function vivoInicial() {
  const serie = (bloque) => (bloque ? bloque.fecha.map((f, i) => [ms(f), bloque.valor[i]]) : []);
  return {
    trm: { estado: "cargando", serie: serie(D.externos.trm) },
    fed: { estado: "cargando", serie: serie(D.externos.fed) },
    usura: { estado: "cargando", ...(D.mercado.usura ?? {}) },
    bancos: { estado: "cargando", corte: D.mercado.corte, entidades: D.mercado.entidades ?? [] },
    ultima: null,
    proxima: null,
  };
}

// GET con límite de tiempo. `no-store` evita que el navegador devuelva una
// copia vieja: aquí interesa el dato de ahora.
async function pedir(url, parametros = {}, espera = 20000) {
  const destino = new URL(url);
  Object.entries(parametros).forEach(([clave, valor]) => destino.searchParams.set(clave, valor));
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), espera);
  try {
    const respuesta = await fetch(destino, { signal: control.signal, cache: "no-store" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return await respuesta.json();
  } finally {
    clearTimeout(reloj);
  }
}

async function consultarTRM() {
  const filas = await pedir(`${SOCRATA}mcec-87by.json`, { $select: "vigenciadesde,valor", $order: "vigenciadesde DESC", $limit: 300 });
  const serie = filas.map((f) => [ms(f.vigenciadesde), Number(f.valor)]).filter(([, v]) => Number.isFinite(v)).reverse();
  if (!serie.length) throw new Error("respuesta vacía");
  return { serie };
}

// La usura es 1,5 veces el interés bancario corriente certificado.
async function consultarUsura() {
  const filas = await pedir(`${SOCRATA}pare-7x5i.json`, { $where: "modalidad='CONSUMO Y ORDINARIO'", $order: "vigencia_desde DESC", $limit: 3 });
  if (!filas.length) throw new Error("respuesta vacía");
  const hoy = Date.now();
  const vigente = filas.find((f) => ms(f.vigencia_desde) <= hoy && hoy <= ms(f.vigencia_hasta) + 86400000) ?? filas[0];
  const ibc = Number(String(vigente.interes_bancario_corriente).replace("%", "").replace(",", "."));
  if (!Number.isFinite(ibc)) throw new Error("formato inesperado");
  return {
    desde: vigente.vigencia_desde.slice(0, 10),
    hasta: vigente.vigencia_hasta.slice(0, 10),
    ibc,
    usura: Math.round(ibc * 150) / 100,
    resolucion: vigente.resolucion,
  };
}

async function consultarFed() {
  const datos = await pedir(FED);
  const serie = datos.refRates.map((f) => [ms(f.effectiveDate), Number(f.percentRate)]).filter(([, v]) => Number.isFinite(v)).reverse();
  if (!serie.length) throw new Error("respuesta vacía");
  return { serie };
}

// La consulta por entidad es pesada. Primero se pregunta solo la fecha del
// último corte: si no hay semana nueva, se confirma lo que ya se tiene.
async function consultarBancos(actual) {
  const maximo = await pedir(`${SOCRATA}qzsc-9esp.json`, { $select: "max(fecha_corte) as f" }, 25000);
  const corte = maximo[0].f.slice(0, 10);
  if (corte === actual.corte && actual.entidades.length) return { corte, entidades: actual.entidades };
  const clave = `tasaviva-bancos-${corte}`;
  let entidades = null;
  try { entidades = JSON.parse(localStorage.getItem(clave)); } catch (error) { entidades = null; }
  if (!entidades) {
    const filas = await pedir(`${SOCRATA}qzsc-9esp.json`, {
      $select: "nombre_entidad,nombre_tipo_entidad,sum(tasa_efectiva_promedio*montos_desembolsados) as tm,sum(montos_desembolsados) as monto,sum(numero_de_creditos) as creditos",
      $where: `fecha_corte='${corte}T00:00:00' AND tipo_de_cr_dito='Consumo' AND producto_de_cr_dito='Libre inversión'`,
      $group: "nombre_entidad,nombre_tipo_entidad",
      $order: "monto DESC",
      $limit: 500,
    }, 90000);
    entidades = filas
      .map((f) => ({ entidad: f.nombre_entidad.trim(), tipo: f.nombre_tipo_entidad, tasa: Number(f.tm) / Number(f.monto), monto: Number(f.monto), creditos: Number(f.creditos) }))
      .filter((e) => e.monto > 0 && Number.isFinite(e.tasa));
    if (!entidades.length) throw new Error("respuesta vacía");
    try { localStorage.setItem(clave, JSON.stringify(entidades)); } catch (error) { /* sin almacenamiento */ }
  }
  return { corte, entidades };
}

const CONSULTAS = {
  trm: consultarTRM,
  usura: consultarUsura,
  fed: consultarFed,
  bancos: consultarBancos,
};

export function iniciarFuentes(almacen) {
  const guardar = (clave, parcial) => almacen.actualizar((estado) => ({
    vivo: { ...estado.vivo, [clave]: { ...estado.vivo[clave], ...parcial } },
  }));

  // Cada fuente va por su cuenta: la que responde primero se pinta primero.
  async function consultar(clave) {
    try {
      const resultado = await CONSULTAS[clave](almacen.obtener().vivo[clave]);
      guardar(clave, { ...resultado, estado: "vivo" });
    } catch (error) {
      guardar(clave, { estado: "guardado" });
    }
  }

  function refrescar() {
    const ahora = Date.now();
    almacen.actualizar((estado) => ({ vivo: { ...estado.vivo, ultima: ahora, proxima: ahora + REFRESCO_MS } }));
    return Promise.all(FUENTES.map(consultar));
  }

  refrescar();
  const reloj = setInterval(refrescar, REFRESCO_MS);
  return { refrescar, detener: () => clearInterval(reloj) };
}

// Resumen del estado de las cuatro fuentes, para el indicador de la barra.
export function estadoGeneral(vivo) {
  const estados = FUENTES.map((clave) => vivo[clave].estado);
  const vivas = estados.filter((e) => e === "vivo").length;
  if (vivas === FUENTES.length) return { estado: "vivo", texto: "En vivo" };
  if (vivas > 0) return { estado: "vivo", texto: `En vivo · ${vivas} de ${FUENTES.length} fuentes` };
  if (estados.includes("cargando")) return { estado: "cargando", texto: "Conectando…" };
  return { estado: "guardado", texto: "Sin conexión · datos guardados" };
}
