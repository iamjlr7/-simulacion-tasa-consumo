/* Gráfico de líneas en SVG, sin librerías.
   Recibe series de puntos [x, y] y dibuja ejes, bandas, marcas y una capa de
   lectura al pasar el cursor. Los colores llegan como variables CSS, así el
   mismo gráfico sirve en tema claro y oscuro. */

import { $, mostrarTip, ocultarTip } from "../nucleo/dom.js";
import { MESES_CORTOS, esc, mesAnio, num, partes, pct } from "../nucleo/formato.js";

export function ticksY(minimo, maximo, cuantos = 5) {
  if (minimo === maximo) { minimo -= 1; maximo += 1; }
  const bruto = (maximo - minimo) / cuantos;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const razon = bruto / magnitud;
  const paso = (razon < 1.5 ? 1 : razon < 3 ? 2 : razon < 7 ? 5 : 10) * magnitud;
  const inicio = Math.floor(minimo / paso) * paso;
  const fin = Math.ceil(maximo / paso) * paso;
  const ticks = [];
  for (let v = inicio; v <= fin + paso / 2; v += paso) ticks.push(Number(v.toFixed(10)));
  return { ticks, paso };
}

function ticksTiempo(x0, x1, ancho) {
  const maximo = Math.max(2, Math.floor(ancho / 78));
  const [a0, m0] = partes(x0);
  const [a1, m1] = partes(x1);
  const cuantosMeses = (a1 - a0) * 12 + (m1 - m0);
  const salida = [];
  if (cuantosMeses > 30) {
    const paso = [1, 2, 5, 10, 20].find((p) => (a1 - a0) / p <= maximo) || 20;
    for (let a = Math.ceil(a0 / paso) * paso; a <= a1; a += paso) {
      const t = Date.UTC(a, 0, 1);
      if (t >= x0 && t <= x1) salida.push({ t, texto: String(a) });
    }
  } else {
    const paso = [1, 2, 3, 6, 12].find((p) => cuantosMeses / p <= maximo) || 12;
    for (let k = 0; k <= cuantosMeses + 1; k += 1) {
      const m = m0 + k;
      if ((((m % 12) + 12) % 12) % paso !== 0) continue;
      const t = Date.UTC(a0, m + 1, 0);
      if (t < x0 || t > x1) continue;
      const [a, mm] = partes(t);
      salida.push({ t, texto: `${MESES_CORTOS[mm]} ${String(a).slice(2)}` });
    }
  }
  return salida;
}

const valido = (y) => y !== null && y !== undefined && Number.isFinite(y);

export function trazo(puntos, sx, sy) {
  let d = "";
  let abierto = false;
  for (const [x, y] of puntos) {
    if (!valido(y)) { abierto = false; continue; }
    d += `${abierto ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
    abierto = true;
  }
  return d;
}

export function poligono(puntos, sx, sy) {
  if (!puntos.length) return "";
  const arriba = puntos.map(([x, , alto]) => `${sx(x).toFixed(1)},${sy(alto).toFixed(1)}`);
  const abajo = puntos.map(([x, bajo]) => `${sx(x).toFixed(1)},${sy(bajo).toFixed(1)}`).reverse();
  return `${arriba.join(" ")} ${abajo.join(" ")}`;
}

export function grafico(contenedor, o) {
  const W = Math.max(280, Math.floor(contenedor.clientWidth));
  const H = o.alto || 300;
  const series = o.series || [];
  const bandas = o.bandas || [];
  const xs = [];
  const ys = [];
  series.forEach((s) => s.p.forEach(([x, y]) => { if (valido(y)) { xs.push(x); ys.push(y); } }));
  bandas.forEach((b) => b.p.forEach(([x, bajo, alto]) => { xs.push(x); ys.push(bajo, alto); }));
  (o.marcas || []).forEach((m) => { xs.push(m.t); ys.push(m.v); });
  if (!xs.length) { contenedor.innerHTML = '<p class="pie-grafico">Sin datos para este periodo.</p>'; return null; }

  const x0 = o.x0 ?? Math.min(...xs);
  const x1 = o.x1 ?? Math.max(...xs);
  let yMin = o.yMin ?? Math.min(...ys);
  const yMax = o.yMax ?? Math.max(...ys);
  if (o.desdeCero) yMin = Math.min(0, yMin);
  const holgura = (yMax - yMin) * 0.06 || 0.5;
  const escala = ticksY(o.desdeCero && yMin === 0 ? 0 : yMin - holgura, yMax + holgura, o.ticks || 5);
  const y0 = escala.ticks[0];
  const y1 = escala.ticks[escala.ticks.length - 1];
  const decimales = escala.paso < 1 ? (escala.paso < 0.1 ? 2 : 1) : 0;
  const yFmt = o.yFmt || ((v) => num(v, decimales));
  const etiquetasY = escala.ticks.map(yFmt);
  const m = {
    l: Math.max(30, Math.max(...etiquetasY.map((t) => t.length)) * 6.4 + 12),
    r: o.margenDer ?? 14,
    t: o.margenSup ?? 10,
    b: 26,
  };
  const sx = (x) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const sy = (y) => m.t + ((y1 - y) / (y1 - y0 || 1)) * (H - m.t - m.b);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.titulo || "Gráfico")}"><g class="eje-y">`;
  escala.ticks.forEach((v, i) => {
    const y = sy(v).toFixed(1);
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--rejilla)" stroke-width="1"/>`;
    svg += `<text x="${m.l - 8}" y="${Number(y) + 4}" text-anchor="end">${etiquetasY[i]}</text>`;
  });
  svg += "</g><g>";
  (o.xTicks || ticksTiempo(x0, x1, W - m.l - m.r)).forEach((tick) => {
    svg += `<text x="${sx(tick.t).toFixed(1)}" y="${H - 8}" text-anchor="middle">${tick.texto}</text>`;
  });
  svg += "</g>";
  bandas.forEach((b) => {
    svg += `<polygon points="${poligono(b.p, sx, sy)}" fill="${b.color}" fill-opacity="${b.op ?? 0.12}" stroke="none"/>`;
  });
  (o.lineasV || []).forEach((l) => {
    const x = sx(l.t).toFixed(1);
    svg += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${H - m.b}" stroke="var(--borde-fuerte)" stroke-width="1"/>`;
    if (l.texto) svg += `<text class="rotulo" x="${Number(x) + (l.ancla === "end" ? -6 : 6)}" y="${m.t + 10}" text-anchor="${l.ancla || "start"}">${esc(l.texto)}</text>`;
  });
  (o.lineasH || []).forEach((l) => {
    if (l.v < y0 || l.v > y1) return;
    const y = sy(l.v).toFixed(1);
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${l.color || "var(--tinta-3)"}" stroke-width="1.2"/>`;
    if (l.texto) svg += `<text class="rotulo" x="${W - m.r - 4}" y="${Number(y) - 5}" text-anchor="end">${esc(l.texto)}</text>`;
  });
  // Capa que otra pieza puede redibujar sin rehacer el gráfico (la simulación).
  if (o.dinamica) svg += '<g data-capa="dinamica"></g>';
  series.forEach((s) => {
    if (s.area) {
      const base = s.p.filter(([, y]) => valido(y)).map(([x, y]) => [x, y0, y]);
      svg += `<polygon points="${poligono(base, sx, sy)}" fill="${s.color}" fill-opacity="0.1" stroke="none"/>`;
    }
    const guion = s.guion ? ` stroke-dasharray="${s.guion}"` : "";
    svg += `<path d="${trazo(s.p, sx, sy)}" fill="none" stroke="${s.color}" stroke-width="${s.ancho || 2}" stroke-linejoin="round" stroke-linecap="round"${guion}/>`;
    if (s.puntoFinal) {
      const final = [...s.p].reverse().find(([, y]) => valido(y));
      if (final) svg += `<circle cx="${sx(final[0]).toFixed(1)}" cy="${sy(final[1]).toFixed(1)}" r="4.5" fill="${s.color}" stroke="var(--superficie)" stroke-width="2"/>`;
    }
  });
  (o.marcas || []).forEach((marca) => {
    svg += `<circle cx="${sx(marca.t).toFixed(1)}" cy="${sy(marca.v).toFixed(1)}" r="5" fill="${marca.color}" stroke="var(--superficie)" stroke-width="2"/>`;
  });
  (o.etiquetas || []).forEach((e) => {
    svg += `<text class="rotulo-fuerte" x="${(sx(e.t) + (e.dx || 0)).toFixed(1)}" y="${(sy(e.v) + (e.dy ?? -10)).toFixed(1)}" text-anchor="${e.ancla || "middle"}">${esc(e.texto)}</text>`;
  });
  svg += `<line data-cruz x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="var(--tinta-3)" stroke-width="1" visibility="hidden"/>`;
  svg += "<g data-puntos></g>";
  svg += `<rect data-zona x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;
  contenedor.innerHTML = svg;

  // Lectura al pasar el cursor: se busca el punto más cercano en x.
  const conTip = series.filter((s) => !s.sinTip);
  const indice = conTip.map((s) => new Map(s.p.filter(([, y]) => valido(y))));
  const tiempos = [...new Set(conTip.flatMap((s) => s.p.filter(([, y]) => valido(y)).map(([x]) => x)))].sort((a, b) => a - b);
  const cruz = $("[data-cruz]", contenedor);
  const capaPuntos = $("[data-puntos]", contenedor);
  const zona = $("[data-zona]", contenedor);
  const xFmt = o.xFmt || mesAnio;
  const vFmt = o.vFmt || ((v) => pct(v));
  zona.addEventListener("pointermove", (evento) => {
    if (!tiempos.length) return;
    const caja = zona.getBoundingClientRect();
    const buscado = x0 + ((evento.clientX - caja.left) / caja.width) * (x1 - x0);
    let bajo = 0;
    let alto = tiempos.length - 1;
    while (alto - bajo > 1) {
      const medio = (bajo + alto) >> 1;
      if (tiempos[medio] < buscado) bajo = medio; else alto = medio;
    }
    const t = Math.abs(tiempos[bajo] - buscado) <= Math.abs(tiempos[alto] - buscado) ? tiempos[bajo] : tiempos[alto];
    const x = sx(t).toFixed(1);
    cruz.setAttribute("x1", x);
    cruz.setAttribute("x2", x);
    cruz.setAttribute("visibility", "visible");
    let filas = "";
    let puntos = "";
    conTip.forEach((s, i) => {
      const v = indice[i].get(t);
      if (v === undefined) return;
      puntos += `<circle cx="${x}" cy="${sy(v).toFixed(1)}" r="4.5" fill="${s.color}" stroke="var(--superficie)" stroke-width="2"/>`;
      filas += `<div><span><i style="background:${s.color}"></i>${esc(s.nombre)}</span><em>${(s.vFmt || vFmt)(v)}</em></div>`;
    });
    capaPuntos.innerHTML = puntos;
    mostrarTip(`<b>${xFmt(t)}</b>${filas}${o.tipExtra ? o.tipExtra(t) : ""}`, evento.clientX, evento.clientY);
  });
  zona.addEventListener("pointerleave", () => {
    cruz.setAttribute("visibility", "hidden");
    capaPuntos.innerHTML = "";
    ocultarTip();
  });
  return { sx, sy, W, H, m, y0, y1, capa: $('[data-capa="dinamica"]', contenedor) };
}

// Leyenda en HTML: el texto va en color de texto y la marca lleva el color.
export function leyenda(contenedor, items) {
  contenedor.innerHTML = items
    .map((item) => `<span><i class="${item.tipo || ""}" style="color:${item.color}"></i>${esc(item.nombre)}</span>`)
    .join("");
}
