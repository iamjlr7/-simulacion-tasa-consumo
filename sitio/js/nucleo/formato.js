/* Formato de números, dinero y fechas en español de Colombia. */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const num = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(Number(v))
  ? "—"
  : Number(v).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (v, d = 2) => `${num(v, d)} %`;
export const signo = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");
export const pp = (v, d = 2) => `${signo(v)}${num(Math.abs(v), d)} pp`;
export const pesos = (v) => `$ ${Math.round(v).toLocaleString("es-CO")}`;
export const pesosCortos = (v) => {
  if (v >= 1e12) return `$ ${num(v / 1e12, 2)} billones`;
  if (v >= 1e9) return `$ ${num(v / 1e9, 0)} mil millones`;
  if (v >= 1e6) return `$ ${num(v / 1e6, 0)} millones`;
  return pesos(v);
};
export const meses = (n) => `${n} ${n === 1 ? "mes" : "meses"}`;

// Las fechas del estudio vienen como "AAAA-MM-DD". Se llevan a milisegundos en
// UTC para que el huso horario del navegador no corra el día.
export const ms = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const partes = (t) => {
  const f = new Date(t);
  return [f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()];
};
const aMs = (t) => (typeof t === "string" ? ms(t) : t);
export const mesAnio = (t) => { const [a, m] = partes(aMs(t)); return `${MESES[m]} de ${a}`; };
export const mesCorto = (t) => { const [a, m] = partes(aMs(t)); return `${MESES_CORTOS[m]} ${a}`; };
export const diaCorto = (t) => { const [a, m, d] = partes(aMs(t)); return `${d} ${MESES_CORTOS[m]} ${a}`; };
export const isoDia = (t) => new Date(t).toISOString().slice(0, 10);

// Sentido de un cambio de tasa: subir es malo para quien pide crédito.
export const clase = (v) => (v > 0.005 ? "sube" : v < -0.005 ? "baja" : "igual");
export const flecha = (v) => (v > 0.005 ? "▲" : v < -0.005 ? "▼" : "•");

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
