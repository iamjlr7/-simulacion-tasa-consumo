/* Histograma de los futuros simulados en un plazo. */

import { num } from "../nucleo/formato.js";
import { ticksY } from "./lineas.js";

// `dominio` es el rango de todos los futuros posibles (no solo los ya
// dibujados), para que el eje no salte mientras corre la animación.
export function histograma(contenedor, valores, { dominio, total, umbral, hoy, marca, nombreMarca }) {
  const W = Math.max(280, Math.floor(contenedor.clientWidth));
  const H = 210;
  const m = { l: 34, r: 14, t: 24, b: 26 };
  const [minimo, maximo] = dominio;
  const rango = maximo - minimo;
  const paso = rango > 16 ? 1 : rango > 7 ? 0.5 : 0.25;
  const inicio = Math.floor(minimo / paso) * paso;
  const fin = Math.ceil((maximo + 1e-9) / paso) * paso;
  const cajas = Math.max(1, Math.round((fin - inicio) / paso));
  const cuenta = new Array(cajas).fill(0);
  valores.forEach((v) => { cuenta[Math.min(cajas - 1, Math.max(0, Math.floor((v - inicio) / paso)))] += 1; });
  const tope = Math.max(4, ...cuenta, Math.ceil(total / Math.max(4, cajas / 3)));
  const escala = ticksY(0, tope, 3);
  const yTope = escala.ticks[escala.ticks.length - 1];
  const sx = (v) => m.l + ((v - inicio) / (fin - inicio)) * (W - m.l - m.r);
  const sy = (c) => m.t + (1 - c / yTope) * (H - m.t - m.b);
  const anchoCaja = (W - m.l - m.r) / cajas;
  const anchoBarra = Math.max(2, Math.min(24, anchoCaja - 2));

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Distribución de la tasa simulada">`;
  escala.ticks.forEach((v) => {
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--rejilla)"/><text x="${m.l - 8}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`;
  });
  const cada = Math.max(1, Math.ceil(cajas / Math.floor((W - m.l - m.r) / 52)));
  for (let k = 0; k <= cajas; k += cada) {
    const v = inicio + k * paso;
    svg += `<text x="${sx(v)}" y="${H - 8}" text-anchor="middle">${num(v, paso < 1 ? 1 : 0)}</text>`;
  }
  cuenta.forEach((c, k) => {
    if (!c) return;
    const desde = inicio + k * paso;
    const x = sx(desde) + (anchoCaja - anchoBarra) / 2;
    const y = sy(c);
    const r = Math.min(4, H - m.b - y, anchoBarra / 2);
    svg += `<path d="M${x},${H - m.b}V${y + r}q0,-${r} ${r},-${r}h${anchoBarra - 2 * r}q${r},0 ${r},${r}V${H - m.b}z" fill="${desde >= umbral ? "var(--s2)" : "var(--s1)"}" data-tip="<b>${num(desde, 2)} – ${num(desde + paso, 2)} %</b><div><span>Futuros simulados</span><em>${c}</em></div>"/>`;
  });
  const raya = (v, texto, ancla) => {
    if (v < inicio || v > fin) return "";
    const x = sx(v);
    return `<line x1="${x}" x2="${x}" y1="${m.t - 6}" y2="${H - m.b}" stroke="var(--tinta-2)" stroke-width="1.2"/><text class="rotulo" x="${x + (ancla === "end" ? -5 : 5)}" y="${m.t - 10}" text-anchor="${ancla}">${texto}</text>`;
  };
  svg += raya(hoy, `Hoy ${num(hoy, 1)}`, marca >= hoy ? "end" : "start");
  svg += raya(marca, `${nombreMarca} ${num(marca, 1)}`, marca >= hoy ? "start" : "end");
  contenedor.innerHTML = `${svg}</svg>`;
}
