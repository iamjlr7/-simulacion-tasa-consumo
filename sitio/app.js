/* TasaViva — lógica de la página.
   Todo corre en el navegador: la proyección se recalcula con los coeficientes
   exportados por el estudio y los indicadores se consultan a las fuentes
   oficiales. Si no hay red, se usan los datos guardados en datos.js. */
(() => {
  "use strict";

  const D = window.DATOS;
  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const $$ = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

  const PRINCIPAL = "ridge_agregados";
  const P = D.panel;
  const N = P.fecha.length;
  const Y0 = P.y[N - 1];
  const ORIGEN = D.meta.origen;
  const FECHAS = D.meta.fechas_proyeccion;
  const HMAX = D.meta.horizonte_max;
  const RIDGE_ESCENARIO = ["ridge_agregados", "ridge_real", "combinado", "ridge_tasa_politica"];
  const RECOMENDADOS = ["ridge_agregados", "combinado", "ridge_real", "paseo_aleatorio"];
  const MOVIMIENTO_REDUCIDO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ */
  /* Formato                                                             */
  /* ------------------------------------------------------------------ */

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  const num = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)))
    ? "—"
    : Number(v).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 2) => `${num(v, d)} %`;
  const signo = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");
  const pp = (v, d = 2) => `${signo(v)}${num(Math.abs(v), d)} pp`;
  const pesos = (v) => `$ ${Math.round(v).toLocaleString("es-CO")}`;
  const pesosCortos = (v) => {
    if (v >= 1e12) return `$ ${num(v / 1e12, 2)} billones`;
    if (v >= 1e9) return `$ ${num(v / 1e9, 0)} mil millones`;
    if (v >= 1e6) return `$ ${num(v / 1e6, 0)} millones`;
    return pesos(v);
  };
  const ms = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const partes = (t) => { const f = new Date(t); return [f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()]; };
  const mesAnio = (t) => { const [a, m] = partes(typeof t === "string" ? ms(t) : t); return `${MESES[m]} de ${a}`; };
  const mesCorto = (t) => { const [a, m] = partes(typeof t === "string" ? ms(t) : t); return `${MESES_C[m]} ${a}`; };
  const diaCorto = (t) => { const [a, m, d] = partes(typeof t === "string" ? ms(t) : t); return `${d} ${MESES_C[m]} ${a}`; };
  const clase = (v) => (v > 0.005 ? "sube" : v < -0.005 ? "baja" : "igual");
  const flecha = (v) => (v > 0.005 ? "▲" : v < -0.005 ? "▼" : "•");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function cuantil(ordenados, q) {
    if (!ordenados.length) return NaN;
    const pos = (ordenados.length - 1) * q;
    const base = Math.floor(pos);
    const resto = pos - base;
    const siguiente = ordenados[Math.min(base + 1, ordenados.length - 1)];
    return ordenados[base] + (siguiente - ordenados[base]) * resto;
  }

  /* ------------------------------------------------------------------ */
  /* Tooltip compartido                                                  */
  /* ------------------------------------------------------------------ */

  const tip = $("#tip");
  function mostrarTip(html, x, y) {
    tip.innerHTML = html;
    tip.classList.add("visible");
    const ancho = tip.offsetWidth;
    const alto = tip.offsetHeight;
    let izquierda = x + 14;
    let arriba = y + 14;
    if (izquierda + ancho > window.innerWidth - 8) izquierda = x - ancho - 14;
    if (arriba + alto > window.innerHeight - 8) arriba = y - alto - 14;
    tip.style.left = `${Math.max(8, izquierda)}px`;
    tip.style.top = `${Math.max(8, arriba)}px`;
  }
  function ocultarTip() { tip.classList.remove("visible"); }

  document.addEventListener("pointermove", (evento) => {
    const fuente = evento.target.closest ? evento.target.closest("[data-tip]") : null;
    if (fuente) mostrarTip(fuente.dataset.tip, evento.clientX, evento.clientY);
    else if (!evento.target.closest || !evento.target.closest(".grafico svg")) ocultarTip();
  });

  /* ------------------------------------------------------------------ */
  /* Gráfico de líneas genérico (SVG)                                    */
  /* ------------------------------------------------------------------ */

  function ticksY(minimo, maximo, cuantos = 5) {
    if (minimo === maximo) { minimo -= 1; maximo += 1; }
    const bruto = (maximo - minimo) / cuantos;
    const magnitud = 10 ** Math.floor(Math.log10(bruto));
    const razon = bruto / magnitud;
    const paso = (razon < 1.5 ? 1 : razon < 3 ? 2 : razon < 7 ? 5 : 10) * magnitud;
    const inicio = Math.floor(minimo / paso) * paso;
    const fin = Math.ceil(maximo / paso) * paso;
    const salida = [];
    for (let v = inicio; v <= fin + paso / 2; v += paso) salida.push(Number(v.toFixed(10)));
    return { ticks: salida, paso };
  }

  function ticksTiempo(x0, x1, ancho) {
    const maximo = Math.max(2, Math.floor(ancho / 78));
    const [a0, m0] = partes(x0);
    const [a1, m1] = partes(x1);
    const meses = (a1 - a0) * 12 + (m1 - m0);
    const salida = [];
    if (meses > 30) {
      const paso = [1, 2, 5, 10, 20].find((p) => (a1 - a0) / p <= maximo) || 20;
      for (let a = Math.ceil(a0 / paso) * paso; a <= a1; a += paso) {
        const t = Date.UTC(a, 0, 1);
        if (t >= x0 && t <= x1) salida.push({ t, texto: String(a) });
      }
    } else {
      const paso = [1, 2, 3, 6, 12].find((p) => meses / p <= maximo) || 12;
      for (let k = 0; k <= meses + 1; k += 1) {
        const m = m0 + k;
        if (((m % 12) + 12) % 12 % paso !== 0) continue;
        const t = Date.UTC(a0, m + 1, 0);
        if (t < x0 || t > x1) continue;
        const [a, mm] = partes(t);
        salida.push({ t, texto: `${MESES_C[mm]} ${String(a).slice(2)}` });
      }
    }
    return salida;
  }

  function trazo(puntos, sx, sy) {
    let d = "";
    let abierto = false;
    for (const [x, y] of puntos) {
      if (y === null || y === undefined || !Number.isFinite(y)) { abierto = false; continue; }
      d += `${abierto ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
      abierto = true;
    }
    return d;
  }

  function poligono(puntos, sx, sy) {
    if (!puntos.length) return "";
    const arriba = puntos.map(([x, , alto]) => `${sx(x).toFixed(1)},${sy(alto).toFixed(1)}`);
    const abajo = puntos.map(([x, bajo]) => `${sx(x).toFixed(1)},${sy(bajo).toFixed(1)}`).reverse();
    return `${arriba.join(" ")} ${abajo.join(" ")}`;
  }

  function grafico(contenedor, o) {
    const W = Math.max(280, Math.floor(contenedor.clientWidth));
    const H = o.alto || 300;
    const series = o.series || [];
    const bandas = o.bandas || [];
    const xs = [];
    const ys = [];
    series.forEach((s) => s.p.forEach(([x, y]) => { if (y !== null && y !== undefined) { xs.push(x); ys.push(y); } }));
    bandas.forEach((b) => b.p.forEach(([x, bajo, alto]) => { xs.push(x); ys.push(bajo, alto); }));
    (o.marcas || []).forEach((m) => { xs.push(m.t); ys.push(m.v); });
    (o.lineasH || []).forEach((l) => { if (l.incluir) ys.push(l.v); });
    if (!xs.length) { contenedor.innerHTML = '<p class="pie-grafico">Sin datos para este periodo.</p>'; return null; }
    const x0 = o.x0 ?? Math.min(...xs);
    const x1 = o.x1 ?? Math.max(...xs);
    let yMin = o.yMin ?? Math.min(...ys);
    let yMax = o.yMax ?? Math.max(...ys);
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

    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.titulo || "Gráfico")}">`;
    svg += '<g class="eje-y">';
    escala.ticks.forEach((v, i) => {
      const y = sy(v).toFixed(1);
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="var(--rejilla)" stroke-width="1"/>`;
      svg += `<text x="${m.l - 8}" y="${Number(y) + 4}" text-anchor="end">${etiquetasY[i]}</text>`;
    });
    svg += "</g><g>";
    const marcasX = o.xTicks ? o.xTicks : ticksTiempo(x0, x1, W - m.l - m.r);
    marcasX.forEach((tick) => {
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
    if (o.dinamica) svg += '<g data-capa="dinamica"></g>';
    series.forEach((s) => {
      if (s.area) {
        const base = s.p.filter(([, y]) => y !== null && y !== undefined).map(([x, y]) => [x, y0, y]);
        svg += `<polygon points="${poligono(base, sx, sy)}" fill="${s.color}" fill-opacity="0.1" stroke="none"/>`;
      }
      const guion = s.guion ? ` stroke-dasharray="${s.guion}"` : "";
      svg += `<path d="${trazo(s.p, sx, sy)}" fill="none" stroke="${s.color}" stroke-width="${s.ancho || 2}" stroke-linejoin="round" stroke-linecap="round"${guion}/>`;
      if (s.puntoFinal) {
        const ultimo = [...s.p].reverse().find(([, y]) => y !== null && y !== undefined);
        if (ultimo) svg += `<circle cx="${sx(ultimo[0]).toFixed(1)}" cy="${sy(ultimo[1]).toFixed(1)}" r="4.5" fill="${s.color}" stroke="var(--superficie)" stroke-width="2"/>`;
      }
    });
    (o.marcas || []).forEach((marca) => {
      svg += `<circle cx="${sx(marca.t).toFixed(1)}" cy="${sy(marca.v).toFixed(1)}" r="5" fill="${marca.color}" stroke="var(--superficie)" stroke-width="2"/>`;
    });
    (o.etiquetas || []).forEach((e) => {
      svg += `<text class="rotulo-fuerte" x="${(sx(e.t) + (e.dx || 0)).toFixed(1)}" y="${(sy(e.v) + (e.dy ?? -10)).toFixed(1)}" text-anchor="${e.ancla || "middle"}">${esc(e.texto)}</text>`;
    });
    svg += `<line data-cruz x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="var(--tinta-3)" stroke-width="1" visibility="hidden"/>`;
    svg += '<g data-puntos></g>';
    svg += `<rect data-zona x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/>`;
    svg += "</svg>";
    contenedor.innerHTML = svg;

    const conTip = series.filter((s) => !s.sinTip);
    const indice = conTip.map((s) => new Map(s.p.filter(([, y]) => y !== null && y !== undefined)));
    const tiempos = [...new Set(conTip.flatMap((s) => s.p.filter(([, y]) => y !== null && y !== undefined).map(([x]) => x)))].sort((a, b) => a - b);
    const cruz = $("[data-cruz]", contenedor);
    const capaPuntos = $("[data-puntos]", contenedor);
    const zona = $("[data-zona]", contenedor);
    const xFmt = o.xFmt || mesAnio;
    const vFmt = o.vFmt || ((v) => pct(v));
    zona.addEventListener("pointermove", (evento) => {
      if (!tiempos.length) return;
      const caja = zona.getBoundingClientRect();
      const xPixel = m.l + ((evento.clientX - caja.left) / caja.width) * (W - m.l - m.r);
      const buscado = x0 + ((xPixel - m.l) / (W - m.l - m.r)) * (x1 - x0);
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
      const extra = o.tipExtra ? o.tipExtra(t) : "";
      mostrarTip(`<b>${xFmt(t)}</b>${filas}${extra}`, evento.clientX, evento.clientY);
    });
    zona.addEventListener("pointerleave", () => {
      cruz.setAttribute("visibility", "hidden");
      capaPuntos.innerHTML = "";
      ocultarTip();
    });
    return { sx, sy, W, H, m, y0, y1, capa: $('[data-capa="dinamica"]', contenedor) };
  }

  function leyenda(contenedor, items) {
    contenedor.innerHTML = items
      .map((item) => `<span><i class="${item.tipo || ""}" style="color:${item.color}"></i>${esc(item.nombre)}</span>`)
      .join("");
  }

  /* ------------------------------------------------------------------ */
  /* Modelo en el navegador                                              */
  /* ------------------------------------------------------------------ */

  const ESCENARIO_BASE = {
    dPol: 0,
    m2: P.g_m2[N - 1],
    inf: P.inflacion[N - 1],
  };

  function sendaRidge(modelo, escenario) {
    const ridge = D.ridge[modelo];
    const x = ridge.x_origen.slice();
    const delta = escenario.dPol / 100;
    const dInf = escenario.inf - ESCENARIO_BASE.inf;
    ridge.columnas.forEach((columna, j) => {
      if (columna === "spread") x[j] -= delta;
      if (columna === "dpol3") x[j] += delta;
      if (columna === "g_m2") x[j] = escenario.m2;
      if (columna === "tasa_real") x[j] += delta - dInf;
    });
    return ridge.ajustes.map((ajuste) => {
      let cambio = ajuste.b0;
      ajuste.coef.forEach((b, j) => { cambio += b * ((x[j] - ajuste.media[j]) / ajuste.desv[j]); });
      return Y0 + cambio;
    });
  }

  function sendaCentral(modelo, escenario = ESCENARIO_BASE) {
    if (modelo === "combinado" && D.ridge.ridge_real) {
      const a = sendaRidge("ridge_agregados", escenario);
      const b = sendaRidge("ridge_real", escenario);
      return a.map((v, i) => (v + b[i]) / 2);
    }
    if (D.ridge[modelo]) return sendaRidge(modelo, escenario);
    return D.proyeccion[modelo].central.slice();
  }

  const admiteEscenario = (modelo) => RIDGE_ESCENARIO.includes(modelo) && (modelo !== "combinado" || !!D.ridge.ridge_real);
  const usaColumna = (modelo, columna) => {
    if (modelo === "combinado") return ["ridge_agregados", "ridge_real"].some((m) => D.ridge[m] && D.ridge[m].columnas.includes(columna));
    return !!D.ridge[modelo] && D.ridge[modelo].columnas.includes(columna);
  };
  const rmse = (modelo, h) => (D.metricas[modelo] ? D.metricas[modelo].rmse[h - 1] : null);

  /* ------------------------------------------------------------------ */
  /* Datos en vivo                                                       */
  /* ------------------------------------------------------------------ */

  const SOCRATA = "https://www.datos.gov.co/resource/";
  const REFRESCO_MS = 5 * 60 * 1000;
  const VIVO = {
    trm: { estado: "cargando", serie: D.externos.trm ? D.externos.trm.fecha.map((f, i) => [ms(f), D.externos.trm.valor[i]]) : [] },
    fed: { estado: "cargando", serie: D.externos.fed ? D.externos.fed.fecha.map((f, i) => [ms(f), D.externos.fed.valor[i]]) : [] },
    usura: { estado: "cargando", ...(D.mercado.usura || {}) },
    bancos: { estado: "cargando", corte: D.mercado.corte, entidades: D.mercado.entidades || [] },
    ultima: null,
    proxima: null,
  };

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

  async function vivoTRM() {
    const filas = await pedir(`${SOCRATA}mcec-87by.json`, { $select: "vigenciadesde,valor", $order: "vigenciadesde DESC", $limit: 300 });
    const serie = filas.map((f) => [ms(f.vigenciadesde), Number(f.valor)]).filter(([, v]) => Number.isFinite(v)).reverse();
    if (!serie.length) throw new Error("vacío");
    VIVO.trm = { estado: "vivo", serie };
  }

  async function vivoUsura() {
    const filas = await pedir(`${SOCRATA}pare-7x5i.json`, { $where: "modalidad='CONSUMO Y ORDINARIO'", $order: "vigencia_desde DESC", $limit: 3 });
    if (!filas.length) throw new Error("vacío");
    const hoy = Date.now();
    const vigente = filas.find((f) => ms(f.vigencia_desde) <= hoy && hoy <= ms(f.vigencia_hasta) + 86400000) || filas[0];
    const ibc = Number(String(vigente.interes_bancario_corriente).replace("%", "").replace(",", "."));
    if (!Number.isFinite(ibc)) throw new Error("formato");
    VIVO.usura = {
      estado: "vivo",
      desde: vigente.vigencia_desde.slice(0, 10),
      hasta: vigente.vigencia_hasta.slice(0, 10),
      ibc,
      usura: Math.round(ibc * 150) / 100,
      resolucion: vigente.resolucion,
    };
  }

  async function vivoFed() {
    const datos = await pedir("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/260.json");
    const serie = datos.refRates.map((f) => [ms(f.effectiveDate), Number(f.percentRate)]).filter(([, v]) => Number.isFinite(v)).reverse();
    if (!serie.length) throw new Error("vacío");
    VIVO.fed = { estado: "vivo", serie };
  }

  async function vivoBancos() {
    const maximo = await pedir(`${SOCRATA}qzsc-9esp.json`, { $select: "max(fecha_corte) as f" }, 25000);
    const corte = maximo[0].f.slice(0, 10);
    if (corte === VIVO.bancos.corte && VIVO.bancos.entidades.length) {
      VIVO.bancos.estado = "vivo";
      return;
    }
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
      if (!entidades.length) throw new Error("vacío");
      try { localStorage.setItem(clave, JSON.stringify(entidades)); } catch (error) { /* sin almacenamiento */ }
    }
    VIVO.bancos = { estado: "vivo", corte, entidades };
  }

  async function intento(clave, tarea, alTerminar) {
    try {
      await tarea();
    } catch (error) {
      VIVO[clave].estado = "guardado";
    }
    alTerminar();
    pintarChip();
  }

  function refrescarVivo() {
    VIVO.ultima = Date.now();
    VIVO.proxima = VIVO.ultima + REFRESCO_MS;
    intento("trm", vivoTRM, () => { pintarFichas(); pintarTRM(); });
    intento("usura", vivoUsura, () => { pintarFichas(); pintarBancos(); pintarCredito(); pintarHistoria(); });
    intento("fed", vivoFed, pintarFichas);
    intento("bancos", vivoBancos, () => { pintarFichas(); pintarBancos(); });
  }

  function pintarChip() {
    const estados = ["trm", "usura", "fed", "bancos"].map((clave) => VIVO[clave].estado);
    const vivos = estados.filter((e) => e === "vivo").length;
    const cargando = estados.some((e) => e === "cargando");
    const chip = $("#chip-vivo");
    const texto = $("#chip-vivo-texto");
    if (vivos > 0) {
      chip.dataset.estado = "vivo";
      texto.textContent = vivos === 4 ? "En vivo" : `En vivo · ${vivos} de 4 fuentes`;
    } else if (cargando) {
      chip.dataset.estado = "cargando";
      texto.textContent = "Conectando…";
    } else {
      chip.dataset.estado = "guardado";
      texto.textContent = "Sin conexión · datos guardados";
    }
  }

  function pintarReloj() {
    const reloj = $("#reloj");
    if (!VIVO.ultima) { reloj.textContent = ""; return; }
    const hora = new Date(VIVO.ultima).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const faltan = Math.max(0, Math.round((VIVO.proxima - Date.now()) / 1000));
    reloj.textContent = `Última consulta ${hora} · próxima en ${Math.floor(faltan / 60)}:${String(faltan % 60).padStart(2, "0")}`;
  }

  /* ------------------------------------------------------------------ */
  /* Resumen                                                             */
  /* ------------------------------------------------------------------ */

  const promedioSistema = (entidades) => {
    const monto = entidades.reduce((suma, e) => suma + e.monto, 0);
    return { tasa: entidades.reduce((suma, e) => suma + e.tasa * e.monto, 0) / monto, monto, creditos: entidades.reduce((s, e) => s + e.creditos, 0) };
  };

  function pintarTitular() {
    const senda = D.proyeccion[PRINCIPAL];
    const doce = senda.central[11];
    const cambio = doce - Y0;
    const verbo = cambio > 0.05 ? "subiría a" : cambio < -0.05 ? "bajaría a" : "seguiría cerca de";
    $("#titular").innerHTML = `La tasa está en <em>${pct(Y0)}</em> y ${verbo} <em>${pct(doce)}</em> en un año`;
    $("#bajada").textContent =
      `Es la tasa promedio que cobran las entidades por un crédito de consumo, efectiva anual, a ${mesAnio(ORIGEN)}. ` +
      `Para ${mesAnio(FECHAS[11])} el rango más probable va de ${pct(senda.b80i[11], 1)} a ${pct(senda.b80s[11], 1)}, según lo que el modelo se ha equivocado en el pasado.`;
    $("#pasos").innerHTML = [1, 3, 6, 12].map((h) => {
      const v = senda.central[h - 1];
      const d = v - Y0;
      return `<div class="paso"><span>En ${h} ${h === 1 ? "mes" : "meses"}</span><strong>${pct(v)}</strong><small class="${clase(d)}">${flecha(d)} ${pp(d)}</small></div>`;
    }).join("");
    if (D.parcial && D.parcial.tasa) {
      const previsto = senda.central[0];
      const dentro = D.parcial.tasa >= senda.b80i[0] && D.parcial.tasa <= senda.b80s[0];
      $("#seguimiento").innerHTML =
        `<b>Seguimiento:</b> para ${mesAnio(FECHAS[0])} el modelo proyectó ${pct(previsto)}. ` +
        `Con ${D.parcial.n} semanas publicadas el promedio va en ${pct(D.parcial.tasa)} ` +
        `(${pp(D.parcial.tasa - previsto)}), ${dentro ? "dentro" : "fuera"} del rango previsto.`;
    }
    $("#pie-datos").textContent =
      `Modelo estimado con ${D.meta.meses} meses, de ${mesAnio(D.meta.inicio)} a ${mesAnio(ORIGEN)}. ` +
      `Datos generados el ${diaCorto(D.meta.generado.slice(0, 10))}.`;
  }

  function pintarHeroe() {
    const desde = N - 61;
    const historia = P.fecha.slice(desde).map((f, i) => [ms(f), P.y[desde + i]]);
    const senda = D.proyeccion[PRINCIPAL];
    const t0 = ms(ORIGEN);
    const central = [[t0, Y0], ...FECHAS.map((f, i) => [ms(f), senda.central[i]])];
    const banda = [[t0, Y0, Y0], ...FECHAS.map((f, i) => [ms(f), senda.b80i[i], senda.b80s[i]])];
    grafico($("#g-heroe"), {
      titulo: "Tasa de consumo observada y proyectada",
      alto: 290,
      margenDer: 54,
      series: [
        { nombre: "Observada", color: "var(--s1)", p: historia, ancho: 2.2 },
        { nombre: "Proyección", color: "var(--s1)", p: central, guion: "5 4", puntoFinal: true },
      ],
      bandas: [{ p: banda, color: "var(--s1)", op: 0.14 }],
      lineasV: [{ t: t0, texto: "Hoy", ancla: "end" }],
      etiquetas: [
        { t: ms(FECHAS[HMAX - 1]), v: senda.central[HMAX - 1], texto: pct(senda.central[HMAX - 1], 1), dx: 8, dy: 4, ancla: "start" },
      ],
      tipExtra: (t) => {
        const i = FECHAS.findIndex((f) => ms(f) === t);
        return i >= 0 ? `<div><span>Rango del 80 %</span><em>${num(senda.b80i[i], 1)} – ${num(senda.b80s[i], 1)} %</em></div>` : "";
      },
    });
  }

  function ficha({ nombre, valor, detalle, estado, etiqueta }) {
    const sello = estado === "vivo"
      ? '<span class="sello vivo-si"><i></i>En vivo</span>'
      : estado === "cargando"
        ? '<span class="sello cargando"><i></i>Consultando</span>'
        : `<span class="sello"><i></i>${etiqueta || "Guardado"}</span>`;
    return `<article class="ficha"><span class="ficha-nombre">${nombre}</span><strong>${valor}</strong><small>${detalle}</small>${sello}</article>`;
  }

  let fichasPrevias = "";
  function pintarFichas() {
    const trm = VIVO.trm.serie;
    const ultimoTRM = trm[trm.length - 1];
    const previoTRM = trm[trm.length - 2];
    const dTRM = ultimoTRM && previoTRM ? ultimoTRM[1] - previoTRM[1] : 0;
    const fed = VIVO.fed.serie;
    const ultimoFed = fed[fed.length - 1];
    const sistema = VIVO.bancos.entidades.length ? promedioSistema(VIVO.bancos.entidades) : null;
    const html = [
      ficha({
        nombre: "Tasa de política",
        valor: pct(D.politica.valor),
        detalle: `Banco de la República · vigente desde el ${diaCorto(D.politica.desde)}${D.politica.anterior !== null ? ` (antes ${pct(D.politica.anterior)})` : ""}`,
        estado: "guardado",
        etiqueta: diaCorto(D.politica.fecha),
      }),
      ficha({
        nombre: "Tope legal (usura)",
        valor: VIVO.usura.usura ? pct(VIVO.usura.usura) : "—",
        detalle: VIVO.usura.usura ? `Máximo para consumo hasta el ${diaCorto(VIVO.usura.hasta)} · 1,5 × interés corriente de ${pct(VIVO.usura.ibc)}` : "Sin dato",
        estado: VIVO.usura.estado,
      }),
      ficha({
        nombre: "Libre inversión, semana",
        valor: sistema ? pct(sistema.tasa) : "—",
        detalle: sistema ? `Semana al ${diaCorto(VIVO.bancos.corte)} · ${VIVO.bancos.entidades.length} entidades · ${num(sistema.creditos, 0)} créditos` : "Sin dato",
        estado: VIVO.bancos.estado,
      }),
      ficha({
        nombre: "Dólar (TRM)",
        valor: ultimoTRM ? `$ ${num(ultimoTRM[1], 2)}` : "—",
        detalle: ultimoTRM ? `${diaCorto(ultimoTRM[0])} · <span class="delta">${flecha(dTRM)} ${signo(dTRM)}${num(Math.abs(dTRM), 2)}</span> frente al día anterior` : "Sin dato",
        estado: VIVO.trm.estado,
      }),
      ficha({
        nombre: "Tasa de la Fed (EE. UU.)",
        valor: ultimoFed ? pct(ultimoFed[1]) : "—",
        detalle: ultimoFed ? `Fondos federales efectiva · ${diaCorto(ultimoFed[0])}` : "Sin dato",
        estado: VIVO.fed.estado,
      }),
      ficha({
        nombre: "Inflación anual",
        valor: pct(P.inflacion[N - 1]),
        detalle: `${mesAnio(ORIGEN)} · meta del Banco: ${pct(P.meta[N - 1], 0)}`,
        estado: "guardado",
        etiqueta: mesCorto(ORIGEN),
      }),
    ].join("");
    if (html === fichasPrevias) return;
    const destino = $("#fichas");
    const anteriores = $$(".ficha strong", destino).map((nodo) => nodo.textContent);
    destino.innerHTML = html;
    $$(".ficha", destino).forEach((nodo, i) => {
      if (anteriores.length && anteriores[i] !== $("strong", nodo).textContent) nodo.classList.add("destello");
    });
    fichasPrevias = html;
  }

  /* ------------------------------------------------------------------ */
  /* Simulador                                                           */
  /* ------------------------------------------------------------------ */

  const SIM = {
    modelo: PRINCIPAL,
    h: 12,
    escenario: { ...ESCENARIO_BASE },
    orden: [],
    jugados: 0,
    corriendo: !MOVIMIENTO_REDUCIDO,
    visible: false,
    acumulado: 0,
    previo: 0,
    central: [],
    base: [],
    lienzo: null,
    umbral: Math.ceil(Y0) + 2,
  };
  const VELOCIDADES = [3, 8, 20, 45, 120];

  const episodios = () => D.errores[SIM.modelo] || { origen: [], e: [] };
  const escenarioActivo = () => admiteEscenario(SIM.modelo) && (
    SIM.escenario.dPol !== 0 ||
    (usaColumna(SIM.modelo, "g_m2") && Math.abs(SIM.escenario.m2 - ESCENARIO_BASE.m2) > 1e-9) ||
    (usaColumna(SIM.modelo, "tasa_real") && Math.abs(SIM.escenario.inf - ESCENARIO_BASE.inf) > 1e-9)
  );

  function barajar(n) {
    const orden = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [orden[i], orden[j]] = [orden[j], orden[i]];
    }
    return orden;
  }

  function reiniciarSim(completo = false) {
    SIM.orden = barajar(episodios().e.length);
    SIM.jugados = completo || MOVIMIENTO_REDUCIDO ? SIM.orden.length : 0;
    SIM.acumulado = 0;
    pintarSimEstatico();
  }

  function llenarControles() {
    const select = $("#s-modelo");
    const disponibles = Object.keys(D.nombres).filter((m) => D.proyeccion[m] && D.errores[m]);
    const grupo = (titulo, ids) => `<optgroup label="${titulo}">${ids.map((m) => `<option value="${m}">${esc(D.nombres[m])}${m === PRINCIPAL ? " (principal)" : ""}</option>`).join("")}</optgroup>`;
    const primeros = RECOMENDADOS.filter((m) => disponibles.includes(m));
    select.innerHTML = grupo("Recomendados", primeros) + grupo("Otros modelos del estudio", disponibles.filter((m) => !primeros.includes(m)));
    select.value = SIM.modelo;
    const m2 = $("#s-m2");
    const valoresM2 = P.g_m2.filter((v) => v !== null);
    // El mínimo se alinea con el valor real para que la rejilla del control
    // pase exactamente por él y "sin cambios" sea de verdad sin cambios.
    const alinear = (control, base, minimo, maximo, paso) => {
      control.step = paso;
      control.min = (base - Math.ceil((base - minimo) / paso) * paso).toFixed(4);
      control.max = (base + Math.ceil((maximo - base) / paso) * paso).toFixed(4);
      control.value = base;
    };
    alinear(m2, ESCENARIO_BASE.m2, Math.min(...valoresM2), Math.max(...valoresM2), 0.5);
    alinear($("#s-inf"), ESCENARIO_BASE.inf, 0, 15, 0.25);
    const umbral = $("#s-umbral");
    umbral.value = SIM.umbral;
    umbral.parentElement.insertAdjacentHTML("beforeend", ' <b id="s-umbral-val"></b>');
  }

  const cercano = (valor, base) => (Math.abs(valor - base) < 1e-3 ? base : valor);

  function leerControles() {
    SIM.h = Number($("#s-h").value);
    SIM.escenario = {
      dPol: Number($("#s-pol").value),
      m2: cercano(Number($("#s-m2").value), ESCENARIO_BASE.m2),
      inf: cercano(Number($("#s-inf").value), ESCENARIO_BASE.inf),
    };
    const u = Number($("#s-umbral").value);
    if (Number.isFinite(u)) SIM.umbral = u;
  }

  function pintarEtiquetasControles() {
    const admite = admiteEscenario(SIM.modelo);
    $("#escenario").disabled = !admite;
    $("#s-m2").disabled = !admite || !usaColumna(SIM.modelo, "g_m2");
    $("#s-inf").disabled = !admite || !usaColumna(SIM.modelo, "tasa_real");
    $("#s-h-val").textContent = `${SIM.h} ${SIM.h === 1 ? "mes" : "meses"} · ${mesCorto(FECHAS[SIM.h - 1])}`;
    const pol = P.pol[N - 1] + SIM.escenario.dPol / 100;
    $("#s-pol-val").textContent = SIM.escenario.dPol === 0 ? `${pct(pol)} (real)` : `${pct(pol)} (${signo(SIM.escenario.dPol)}${Math.abs(SIM.escenario.dPol)} pb)`;
    $("#s-m2-val").textContent = `${pct(SIM.escenario.m2, 2)}${Math.abs(SIM.escenario.m2 - ESCENARIO_BASE.m2) < 1e-9 ? " (real)" : ""}`;
    $("#s-inf-val").textContent = `${pct(SIM.escenario.inf, 2)}${Math.abs(SIM.escenario.inf - ESCENARIO_BASE.inf) < 1e-9 ? " (real)" : ""}`;
    $("#s-esc-ayuda").textContent = admite
      ? `Cambia el punto de partida de ${mesAnio(ORIGEN)} y recalcula el modelo. No supone una senda futura de la política ni del dinero.`
      : "Este modelo no se recalcula en la página: usa la proyección ya estimada. Elige un modelo Ridge para probar escenarios.";
    const e12 = rmse(SIM.modelo, 12);
    const paseo12 = rmse("paseo_aleatorio", 12);
    const mejora = e12 !== null && paseo12 ? (1 - e12 / paseo12) * 100 : null;
    $("#s-modelo-ayuda").textContent = e12 === null ? "" :
      `Error típico a 12 meses: ${num(e12)} pp` +
      (SIM.modelo === "paseo_aleatorio" ? ". Es la referencia: suponer que la tasa no cambia." :
        mejora >= 0 ? `, ${num(mejora, 0)} % menos que suponer que la tasa no cambia.` : `, ${num(-mejora, 0)} % más que suponer que la tasa no cambia.`);
    $("#s-play").textContent = SIM.jugados >= SIM.orden.length ? "Repetir" : SIM.corriendo ? "Pausar" : "Continuar";
  }

  function pintarSimEstatico() {
    const contenedor = $("#g-sim");
    SIM.central = sendaCentral(SIM.modelo, admiteEscenario(SIM.modelo) ? SIM.escenario : ESCENARIO_BASE);
    SIM.base = sendaCentral(SIM.modelo, ESCENARIO_BASE);
    const conEscenario = escenarioActivo();
    const desde = N - 37;
    const t0 = ms(ORIGEN);
    const historia = P.fecha.slice(desde).map((f, i) => [ms(f), P.y[desde + i]]);
    const central = [[t0, Y0], ...FECHAS.map((f, i) => [ms(f), SIM.central[i]])];
    const todos = episodios().e;
    let minimo = Math.min(...historia.map((p) => p[1]));
    let maximo = Math.max(...historia.map((p) => p[1]));
    todos.forEach((fila) => fila.forEach((error, i) => {
      const v = SIM.central[i] + error;
      if (v < minimo) minimo = v;
      if (v > maximo) maximo = v;
    }));
    const series = [
      { nombre: "Observada", color: "var(--s1)", p: historia, ancho: 2.2 },
      { nombre: conEscenario ? "Proyección con tu escenario" : "Proyección", color: "var(--s1)", p: central, ancho: 2.6, puntoFinal: true },
    ];
    if (conEscenario) {
      series.push({ nombre: "Proyección sin cambios", color: "var(--neutro)", p: [[t0, Y0], ...FECHAS.map((f, i) => [ms(f), SIM.base[i]])], guion: "4 4", ancho: 1.6 });
    }
    const marcas = [];
    if (D.parcial && D.parcial.tasa) marcas.push({ t: ms(FECHAS[0]), v: D.parcial.tasa, color: "var(--s3)" });
    SIM.lienzo = grafico(contenedor, {
      titulo: "Simulación de la tasa de consumo",
      alto: 400,
      margenDer: 16,
      yMin: minimo,
      yMax: maximo,
      series,
      marcas,
      dinamica: true,
      lineasV: [
        { t: t0, texto: "Hoy", ancla: "end" },
        { t: ms(FECHAS[SIM.h - 1]), texto: mesCorto(FECHAS[SIM.h - 1]), ancla: SIM.h > 18 ? "end" : "start" },
      ],
      tipExtra: (t) => {
        const i = FECHAS.findIndex((f) => ms(f) === t);
        if (i < 0) return "";
        const b = bandaEn(i);
        return b ? `<div><span>Rango del 80 %</span><em>${num(b.q10, 1)} – ${num(b.q90, 1)} %</em></div>` : "";
      },
    });
    const items = [
      { nombre: "Observada", color: "var(--s1)" },
      { nombre: conEscenario ? "Proyección con tu escenario" : "Proyección", color: "var(--s1)" },
    ];
    if (conEscenario) items.push({ nombre: "Proyección sin cambios", color: "var(--neutro)", tipo: "guion" });
    items.push(
      { nombre: "Futuros posibles", color: "var(--neutro)", tipo: "fino" },
      { nombre: "Rango del 80 % y del 95 %", color: "var(--s1)", tipo: "banda" },
    );
    if (marcas.length) items.push({ nombre: `${mesCorto(FECHAS[0])} con datos parciales`, color: "var(--s3)", tipo: "punto" });
    leyenda($("#sim-leyenda"), items);
    $("#sim-sub").textContent = `${D.nombres[SIM.modelo]} · efectiva anual, promedio del mes`;
    pintarEtiquetasControles();
    pintarSimDinamico();
  }

  function valoresEn(i) {
    const todos = episodios().e;
    const valores = [];
    for (let k = 0; k < SIM.jugados; k += 1) valores.push(SIM.central[i] + todos[SIM.orden[k]][i]);
    return valores;
  }

  function bandaEn(i) {
    if (SIM.jugados < 8) return null;
    const ordenados = valoresEn(i).sort((a, b) => a - b);
    return { q025: cuantil(ordenados, 0.025), q10: cuantil(ordenados, 0.1), q90: cuantil(ordenados, 0.9), q975: cuantil(ordenados, 0.975) };
  }

  function pintarSimDinamico() {
    const lienzo = SIM.lienzo;
    if (!lienzo || !lienzo.capa) return;
    const { sx, sy } = lienzo;
    const todos = episodios();
    const t0 = ms(ORIGEN);
    const tiempos = FECHAS.map(ms);
    let svg = "";
    if (SIM.jugados >= 8) {
      const b95 = [[t0, Y0, Y0]];
      const b80 = [[t0, Y0, Y0]];
      for (let i = 0; i < HMAX; i += 1) {
        const b = bandaEn(i);
        b95.push([tiempos[i], b.q025, b.q975]);
        b80.push([tiempos[i], b.q10, b.q90]);
      }
      svg += `<polygon points="${poligono(b95, sx, sy)}" fill="var(--s1)" fill-opacity="0.09"/>`;
      svg += `<polygon points="${poligono(b80, sx, sy)}" fill="var(--s1)" fill-opacity="0.13"/>`;
    }
    const x0 = sx(t0).toFixed(1);
    const yInicio = sy(Y0).toFixed(1);
    for (let k = 0; k < SIM.jugados; k += 1) {
      const fila = todos.e[SIM.orden[k]];
      let d = `M${x0},${yInicio}`;
      for (let i = 0; i < HMAX; i += 1) d += `L${sx(tiempos[i]).toFixed(1)},${sy(SIM.central[i] + fila[i]).toFixed(1)}`;
      const ultimo = k === SIM.jugados - 1 && SIM.jugados < SIM.orden.length;
      svg += ultimo
        ? `<path d="${d}" fill="none" stroke="var(--s2)" stroke-width="1.8" stroke-linejoin="round"/>`
        : `<path d="${d}" fill="none" stroke="var(--neutro)" stroke-width="0.8" stroke-opacity="0.38" stroke-linejoin="round"/>`;
    }
    lienzo.capa.innerHTML = svg;

    const total = SIM.orden.length;
    $("#sim-cuenta").textContent = `${SIM.jugados} de ${total} episodios`;
    $("#sim-barra").style.width = `${total ? (SIM.jugados / total) * 100 : 0}%`;
    if (SIM.jugados > 0 && SIM.jugados < total) {
      const origen = todos.origen[SIM.orden[SIM.jugados - 1]];
      $("#sim-episodio").innerHTML = `Línea naranja: la proyección de hoy con el error que el modelo tuvo al pronosticar desde <b>${mesAnio(origen)}</b>.`;
    } else if (total) {
      $("#sim-episodio").textContent = `Listo: ${total} futuros posibles, uno por cada mes entre ${mesAnio(todos.origen[0])} y ${mesAnio(todos.origen[total - 1])} en que se puso a prueba el modelo.`;
    }
    pintarResultados();
  }

  function pintarResultados() {
    const i = SIM.h - 1;
    const central = SIM.central[i];
    const valores = valoresEn(i);
    const ordenados = valores.slice().sort((a, b) => a - b);
    const hay = valores.length >= 8;
    const suben = valores.filter((v) => v > Y0).length;
    const sobre = valores.filter((v) => v > SIM.umbral).length;
    const cambio = central - Y0;
    const error = rmse(SIM.modelo, SIM.h);
    const errorPaseo = rmse("paseo_aleatorio", SIM.h);
    const fecha = mesAnio(FECHAS[i]);
    $("#sim-resultados").innerHTML = `
      <div class="dato"><span>Tasa esperada en ${fecha}</span><strong>${pct(central)}</strong>
        <small><b class="${clase(cambio)}">${flecha(cambio)} ${pp(cambio)}</b> frente a hoy (${pct(Y0)})</small></div>
      <div class="dato"><span>Rango probable (80 %)</span><strong>${hay ? `${num(cuantil(ordenados, 0.1), 1)} – ${num(cuantil(ordenados, 0.9), 1)} %` : "…"}</strong>
        <small>8 de cada 10 futuros simulados terminan aquí</small></div>
      <div class="dato"><span>Probabilidad de que suba</span><strong>${hay ? `${num((suben / valores.length) * 100, 0)} %` : "…"}</strong>
        <small>${suben} de ${valores.length} futuros quedan por encima de hoy</small></div>
      <div class="dato"><span>Error típico a este plazo</span><strong>${error === null ? "—" : `±${num(error)} pp`}</strong>
        <small>${errorPaseo ? `Suponer tasa constante falla ±${num(errorPaseo)} pp` : ""}</small></div>`;
    $("#hist-titulo").textContent = `Dónde termina la tasa en ${fecha}`;
    $("#hist-sub").textContent = `Cada barra cuenta cuántos de los ${valores.length} futuros simulados caen en ese tramo. En naranja, los que superan ${pct(SIM.umbral, 2)}.`;
    $("#s-umbral-val").textContent = valores.length ? `= ${num((sobre / valores.length) * 100, 0)} %` : "";
    histograma($("#g-hist"), valores, central);
  }

  function histograma(contenedor, valores, central) {
    const W = Math.max(280, Math.floor(contenedor.clientWidth));
    const H = 210;
    const m = { l: 34, r: 14, t: 22, b: 26 };
    const todos = episodios().e;
    const i = SIM.h - 1;
    let minimo = Y0;
    let maximo = Y0;
    todos.forEach((fila) => {
      const v = SIM.central[i] + fila[i];
      if (v < minimo) minimo = v;
      if (v > maximo) maximo = v;
    });
    const rango = maximo - minimo;
    const paso = rango > 16 ? 1 : rango > 7 ? 0.5 : 0.25;
    const inicio = Math.floor(minimo / paso) * paso;
    const fin = Math.ceil((maximo + 1e-9) / paso) * paso;
    const cajas = Math.max(1, Math.round((fin - inicio) / paso));
    const cuenta = new Array(cajas).fill(0);
    valores.forEach((v) => { cuenta[Math.min(cajas - 1, Math.max(0, Math.floor((v - inicio) / paso)))] += 1; });
    const tope = Math.max(4, ...cuenta, Math.ceil(todos.length / Math.max(4, cajas / 3)));
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
      const x = sx(inicio + k * paso) + (anchoCaja - anchoBarra) / 2;
      const y = sy(c);
      const alto = H - m.b - y;
      const r = Math.min(4, alto, anchoBarra / 2);
      const desde = inicio + k * paso;
      const sobreUmbral = desde >= SIM.umbral;
      svg += `<path d="M${x},${H - m.b}V${y + r}q0,-${r} ${r},-${r}h${anchoBarra - 2 * r}q${r},0 ${r},${r}V${H - m.b}z" fill="${sobreUmbral ? "var(--s2)" : "var(--s1)"}" data-tip="<b>${num(desde, 2)} – ${num(desde + paso, 2)} %</b><div><span>Futuros simulados</span><em>${c}</em></div>"/>`;
    });
    const raya = (v, texto, ancla) => {
      if (v < inicio || v > fin) return "";
      const x = sx(v);
      return `<line x1="${x}" x2="${x}" y1="${m.t - 6}" y2="${H - m.b}" stroke="var(--tinta-2)" stroke-width="1.2"/><text class="rotulo" x="${x + (ancla === "end" ? -5 : 5)}" y="${m.t - 9}" text-anchor="${ancla}">${texto}</text>`;
    };
    svg += raya(Y0, `Hoy ${num(Y0, 1)}`, central >= Y0 ? "end" : "start");
    svg += raya(central, `Esperada ${num(central, 1)}`, central >= Y0 ? "start" : "end");
    svg += "</svg>";
    contenedor.innerHTML = svg;
  }

  function cuadroSim(ahora) {
    if (SIM.corriendo && SIM.visible && SIM.jugados < SIM.orden.length) {
      const paso = Math.min(0.1, (ahora - SIM.previo) / 1000);
      SIM.acumulado += paso * VELOCIDADES[Number($("#s-vel").value) - 1];
      const nuevos = Math.floor(SIM.acumulado);
      if (nuevos > 0) {
        SIM.acumulado -= nuevos;
        SIM.jugados = Math.min(SIM.orden.length, SIM.jugados + nuevos);
        pintarSimDinamico();
        if (SIM.jugados >= SIM.orden.length) pintarEtiquetasControles();
      }
    }
    SIM.previo = ahora;
    requestAnimationFrame(cuadroSim);
  }

  function conectarSim() {
    $("#s-modelo").addEventListener("change", (evento) => {
      SIM.modelo = evento.target.value;
      SIM.corriendo = !MOVIMIENTO_REDUCIDO;
      reiniciarSim();
    });
    ["#s-h", "#s-pol", "#s-m2", "#s-inf"].forEach((id) => $(id).addEventListener("input", () => {
      leerControles();
      pintarSimEstatico();
    }));
    $("#s-umbral").addEventListener("input", () => { leerControles(); pintarResultados(); });
    $("#s-restablecer").addEventListener("click", () => {
      $("#s-pol").value = 0;
      $("#s-m2").value = ESCENARIO_BASE.m2;
      $("#s-inf").value = ESCENARIO_BASE.inf;
      leerControles();
      pintarSimEstatico();
    });
    $("#s-play").addEventListener("click", () => {
      if (SIM.jugados >= SIM.orden.length) { SIM.corriendo = true; reiniciarSim(); return; }
      SIM.corriendo = !SIM.corriendo;
      pintarEtiquetasControles();
    });
    $("#s-reiniciar").addEventListener("click", () => { SIM.corriendo = true; reiniciarSim(); });
    new IntersectionObserver((entradas) => { SIM.visible = entradas[0].isIntersecting; }, { threshold: 0.15 }).observe($("#g-sim"));
    requestAnimationFrame(cuadroSim);
  }

  /* ------------------------------------------------------------------ */
  /* Crédito                                                             */
  /* ------------------------------------------------------------------ */

  function cuotaMensual(monto, tasaEA, meses) {
    const i = (1 + tasaEA / 100) ** (1 / 12) - 1;
    if (i === 0) return monto / meses;
    return (monto * i) / (1 - (1 + i) ** -meses);
  }

  function leerMonto() {
    const limpio = Number($("#c-monto").value.replace(/[^\d]/g, ""));
    return Number.isFinite(limpio) && limpio > 0 ? limpio : 0;
  }

  function pintarCredito() {
    const monto = leerMonto();
    const plazo = Number($("#c-plazo").value);
    const h = Number($("#c-cuando").value);
    const anios = plazo / 12;
    $("#c-plazo-val").textContent = `${plazo} meses${plazo % 12 === 0 ? ` (${anios} ${anios === 1 ? "año" : "años"})` : ""}`;
    const senda = D.proyeccion[PRINCIPAL];
    const futura = senda.central[h - 1];
    const baja = senda.b80i[h - 1];
    const alta = senda.b80s[h - 1];
    const cuotaHoy = cuotaMensual(monto, Y0, plazo);
    const cuotaFutura = cuotaMensual(monto, futura, plazo);
    const diferencia = cuotaFutura - cuotaHoy;
    const tarjeta = (titulo, tasa, cuota, extra, destacada) => `
      <div class="tarjeta cuota${destacada ? " destacada" : ""}">
        <h3>${titulo}</h3>
        <p class="grande">${pesos(cuota)} <small>al mes</small></p>
        <dl>
          <dt>Tasa efectiva anual</dt><dd>${pct(tasa)}</dd>
          <dt>Intereses en todo el crédito</dt><dd>${pesos(cuota * plazo - monto)}</dd>
          <dt>Total que pagarías</dt><dd>${pesos(cuota * plazo)}</dd>
          ${extra}
        </dl>
      </div>`;
    const usura = VIVO.usura.usura;
    $("#c-salida").innerHTML = !monto ? '<div class="tarjeta">Escribe un monto para calcular la cuota.</div>' : `
      <div class="cuotas">
        ${tarjeta(`Si lo pides hoy`, Y0, cuotaHoy, "", false)}
        ${tarjeta(`Si lo pides en ${mesAnio(FECHAS[h - 1])}`, futura, cuotaFutura,
          `<dt>Cuota en el rango del 80 %</dt><dd>${pesos(cuotaMensual(monto, baja, plazo))} – ${pesos(cuotaMensual(monto, alta, plazo))}</dd>`, true)}
      </div>
      <div class="tarjeta veredicto">
        ${Math.abs(diferencia) < 1
          ? "Con la proyección actual, la cuota sería prácticamente la misma."
          : `Según la proyección, esperar ${h} ${h === 1 ? "mes" : "meses"} ${diferencia > 0 ? "encarecería" : "abarataría"} la cuota en unos
             <b class="${clase(diferencia)}">${pesos(Math.abs(diferencia))} al mes</b>
             (${pesos(Math.abs(diferencia) * plazo)} en todo el crédito). Es una estimación con incertidumbre: mira el rango.`}
      </div>
      ${usura ? `<div class="tarjeta tope"><span><b>Tope legal vigente: ${pct(usura)} efectiva anual.</b>
        Ninguna entidad puede cobrarte más que la tasa de usura en un crédito de consumo. A esa tasa, la cuota de este crédito sería ${pesos(cuotaMensual(monto, usura, plazo))} al mes.</span></div>` : ""}`;
  }

  function conectarCredito() {
    $("#c-cuando").innerHTML = [1, 3, 6, 12, 18, 24]
      .map((h) => `<option value="${h}"${h === 6 ? " selected" : ""}>En ${h} ${h === 1 ? "mes" : "meses"} (${mesAnio(FECHAS[h - 1])})</option>`)
      .join("");
    $("#c-monto").addEventListener("input", (evento) => {
      const limpio = evento.target.value.replace(/[^\d]/g, "").slice(0, 12);
      evento.target.value = limpio ? Number(limpio).toLocaleString("es-CO") : "";
      pintarCredito();
    });
    $("#c-plazo").addEventListener("input", pintarCredito);
    $("#c-cuando").addEventListener("change", pintarCredito);
  }

  /* ------------------------------------------------------------------ */
  /* Mercado                                                             */
  /* ------------------------------------------------------------------ */

  let ordenBancos = "monto";

  function pintarBancos() {
    const entidades = VIVO.bancos.entidades;
    const destino = $("#g-bancos");
    if (!entidades.length) { destino.innerHTML = '<p class="pie-grafico">Sin datos de entidades.</p>'; return; }
    const sistema = promedioSistema(entidades);
    const usura = VIVO.usura.usura || 0;
    const relevantes = entidades.filter((e) => e.creditos >= 50);
    const lista = (ordenBancos === "tasa"
      ? relevantes.slice().sort((a, b) => a.tasa - b.tasa)
      : entidades.slice().sort((a, b) => b.monto - a.monto)).slice(0, 14);
    const tope = Math.max(usura, ...lista.map((e) => e.tasa)) * 1.04;
    const fila = (nombre, tasa, detalle, promedio) => `
      <div class="barra-fila${promedio ? " promedio" : ""}" data-tip="${esc(detalle)}">
        <span class="nombre">${esc(nombre)}</span>
        <div class="pista"><div class="relleno" style="width:${(tasa / tope) * 100}%"></div>${usura ? `<div class="raya" style="left:${(usura / tope) * 100}%"></div>` : ""}</div>
        <span class="valor">${pct(tasa)}</span>
      </div>`;
    const detalle = (e) => `<b>${esc(e.entidad)}</b><div><span>Tasa promedio</span><em>${pct(e.tasa)}</em></div><div><span>Desembolsado</span><em>${pesosCortos(e.monto)}</em></div><div><span>Créditos</span><em>${num(e.creditos, 0)}</em></div>`;
    destino.innerHTML =
      fila("Promedio del sistema", sistema.tasa, `<b>Promedio ponderado por monto</b><div><span>Tasa</span><em>${pct(sistema.tasa)}</em></div><div><span>Desembolsado</span><em>${pesosCortos(sistema.monto)}</em></div>`, true) +
      lista.map((e) => fila(e.entidad, e.tasa, detalle(e), false)).join("");
    $("#bancos-sub").textContent = `Semana al ${diaCorto(VIVO.bancos.corte)} · ${entidades.length} entidades · ${pesosCortos(sistema.monto)} desembolsados`;
    $("#bancos-pie").textContent =
      (ordenBancos === "tasa" ? "Entidades con al menos 50 créditos en la semana, de menor a mayor tasa. " : "Las 14 entidades que más prestaron en la semana. ") +
      (usura ? `La raya vertical marca el tope legal (${pct(usura)}). ` : "") +
      "Tasa efectiva anual promedio ponderada por monto. Fuente: Superintendencia Financiera.";
  }

  function pintarSemanal() {
    const semanal = D.mercado.semanal;
    if (!semanal) return;
    const libre = semanal.fecha.map((f, i) => [ms(f), semanal.tasa[i]]);
    const inicio = libre[0][0] - 7 * 86400000;
    const consumo = D.semanal.fecha.map((f, i) => [ms(f), D.semanal.y[i]]).filter(([t]) => t >= inicio);
    grafico($("#g-semanal"), {
      titulo: "Tasas semanales de libre inversión y de consumo",
      alto: 230,
      series: [
        { nombre: "Libre inversión (Superintendencia)", color: "var(--s2)", p: libre, puntoFinal: true },
        { nombre: "Consumo total (Banco de la República)", color: "var(--s1)", p: consumo, puntoFinal: true },
      ],
      xFmt: (t) => `Semana al ${diaCorto(t)}`,
    });
    leyenda($("#sem-leyenda"), [
      { nombre: "Libre inversión (Superintendencia)", color: "var(--s2)" },
      { nombre: "Consumo total (Banco de la República)", color: "var(--s1)" },
    ]);
  }

  function pintarTRM() {
    const serie = VIVO.trm.serie;
    if (!serie.length) return;
    const desde = serie[serie.length - 1][0] - 366 * 86400000;
    const reciente = serie.filter(([t]) => t >= desde);
    const ultimo = reciente[reciente.length - 1];
    const primero = reciente[0];
    const variacion = (ultimo[1] / primero[1] - 1) * 100;
    $("#trm-sub").textContent = `Pesos por dólar · ${signo(variacion)}${num(Math.abs(variacion), 1)} % en doce meses`;
    grafico($("#g-trm"), {
      titulo: "TRM del último año",
      alto: 200,
      margenDer: 16,
      series: [{ nombre: "TRM", color: "var(--s6)", p: reciente, area: false, puntoFinal: true }],
      yFmt: (v) => num(v, 0),
      vFmt: (v) => `$ ${num(v, 2)}`,
      xFmt: diaCorto,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Historia                                                            */
  /* ------------------------------------------------------------------ */

  const SERIES_HISTORIA = [
    { id: "y", nombre: "Crédito de consumo", color: "var(--s1)", activa: true },
    { id: "pol", nombre: "Tasa de política", color: "var(--s2)", activa: true },
    { id: "usura", nombre: "Tope legal (usura)", color: "var(--s3)", activa: true },
    { id: "inflacion", nombre: "Inflación anual", color: "var(--s4)", activa: false },
    { id: "fed", nombre: "Tasa de la Fed", color: "var(--s5)", activa: false },
  ];
  let aniosHistoria = 0;

  function recorte(campo) {
    const limite = aniosHistoria ? Date.UTC(partes(ms(ORIGEN))[0] - aniosHistoria, partes(ms(ORIGEN))[1], 1) : -Infinity;
    const salida = [];
    P.fecha.forEach((f, i) => {
      const t = ms(f);
      if (t >= limite && P[campo]) salida.push([t, P[campo][i]]);
    });
    return salida;
  }

  function pintarHistoria() {
    const activas = SERIES_HISTORIA.filter((s) => s.activa && P[s.id]);
    grafico($("#g-historia"), {
      titulo: "Historia de la tasa de consumo y sus determinantes",
      alto: 360,
      desdeCero: true,
      series: activas.map((s) => ({ nombre: s.nombre, color: s.color, p: recorte(s.id), ancho: s.id === "y" ? 2.4 : 1.8 })),
    });
    grafico($("#g-dinero"), {
      titulo: "Crecimiento anual de los agregados monetarios",
      alto: 230,
      series: [
        { nombre: "M1", color: "var(--s1)", p: recorte("g_m1"), ancho: 1.8 },
        { nombre: "M2", color: "var(--s2)", p: recorte("g_m2"), ancho: 1.8 },
        { nombre: "M3", color: "var(--s3)", p: recorte("g_m3"), ancho: 1.8 },
      ],
      lineasH: [{ v: 0 }],
    });
    leyenda($("#dinero-leyenda"), [
      { nombre: "M1 (efectivo y cuentas corrientes)", color: "var(--s1)" },
      { nombre: "M2 (más ahorros y CDT)", color: "var(--s2)" },
      { nombre: "M3 (todo lo anterior y otros depósitos)", color: "var(--s3)" },
    ]);
    if (P.trm) {
      grafico($("#g-trm-hist"), {
        titulo: "TRM promedio mensual",
        alto: 230,
        series: [{ nombre: "TRM", color: "var(--s6)", p: recorte("trm") }],
        yFmt: (v) => num(v, 0),
        vFmt: (v) => `$ ${num(v, 0)}`,
      });
    }
  }

  function conectarHistoria() {
    const chips = $("#h-series");
    chips.innerHTML = SERIES_HISTORIA.filter((s) => P[s.id])
      .map((s) => `<button type="button" class="chip" data-serie="${s.id}" aria-pressed="${s.activa}" style="--c:${s.color}"><i></i>${s.nombre}</button>`)
      .join("");
    chips.addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-serie]");
      if (!boton) return;
      const serie = SERIES_HISTORIA.find((s) => s.id === boton.dataset.serie);
      if (serie.activa && SERIES_HISTORIA.filter((s) => s.activa).length === 1) return;
      serie.activa = !serie.activa;
      boton.setAttribute("aria-pressed", String(serie.activa));
      pintarHistoria();
    });
    $("#h-rango").addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-anios]");
      if (!boton) return;
      aniosHistoria = Number(boton.dataset.anios);
      $$("#h-rango button").forEach((b) => b.classList.toggle("activo", b === boton));
      pintarHistoria();
    });
    $$("#mercado .segmento button").forEach((boton) => boton.addEventListener("click", () => {
      ordenBancos = boton.dataset.orden;
      $$("#mercado .segmento button").forEach((b) => b.classList.toggle("activo", b === boton));
      pintarBancos();
    }));
  }

  /* ------------------------------------------------------------------ */
  /* Confiabilidad y método                                              */
  /* ------------------------------------------------------------------ */

  function tabla(cabeza, filas) {
    return `<table><thead><tr>${cabeza.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${filas.join("")}</tbody></table>`;
  }

  function pintarConfianza() {
    const metricas = D.metricas[PRINCIPAL];
    const paseo = D.metricas.paseo_aleatorio;
    const cobertura = D.cobertura[PRINCIPAL];
    const dato = (h) => `<div class="dato"><span>Error típico a ${h} ${h === 1 ? "mes" : "meses"}</span><strong>±${num(metricas.rmse[h - 1])} pp</strong>
      <small>${num((1 - metricas.rmse[h - 1] / paseo.rmse[h - 1]) * 100, 0)} % menos que suponer tasa constante (±${num(paseo.rmse[h - 1])} pp)</small></div>`;
    $("#conf-fichas").innerHTML = dato(1) + dato(6) + dato(12) +
      `<div class="dato"><span>Aciertos reales del rango del 80 %</span><strong>${num(cobertura.c80[11] * 100, 0)} %</strong>
       <small>A 12 meses el dato cayó dentro del rango menos de lo prometido (${num(cobertura.c80[0] * 100, 0)} % a 1 mes): tómalo como un rango optimista.</small></div>`;

    const horizontes = Array.from({ length: HMAX }, (_, i) => i + 1);
    const lineas = [
      { id: "paseo_aleatorio", color: "var(--neutro)", ancho: 1.8, guion: "5 4" },
      { id: PRINCIPAL, color: "var(--s1)", ancho: 2.4 },
    ].filter((l) => D.metricas[l.id]);
    grafico($("#g-rmse"), {
      titulo: "Error típico por plazo",
      alto: 270,
      desdeCero: true,
      series: lineas.map((l) => ({ nombre: D.nombres[l.id], color: l.color, ancho: l.ancho, guion: l.guion, p: horizontes.map((h) => [h, D.metricas[l.id].rmse[h - 1]]) })),
      xTicks: [1, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => ({ t: h, texto: h === 1 ? "1 mes" : String(h) })),
      xFmt: (h) => `Plazo de ${h} ${h === 1 ? "mes" : "meses"}`,
      vFmt: (v) => `±${num(v)} pp`,
    });
    leyenda($("#rmse-leyenda"), lineas.map((l) => ({ nombre: D.nombres[l.id], color: l.color, tipo: l.guion ? "guion" : "" })));

    const nuevas = D.variables_nuevas;
    if (nuevas.length) {
      const base = nuevas.find((v) => v.id === "base");
      const filas = nuevas.map((v) => {
        const celdas = v.rmse.map((valor, i) => {
          if (v.id === "base") return `<td>${num(valor)}</td>`;
          const d = valor - base.rmse[i];
          const tipo = d < -0.005 ? "mejora" : d > 0.005 ? "empeora" : "neutro";
          return `<td><span class="${tipo}">${signo(d)}${num(Math.abs(d))}</span></td>`;
        }).join("");
        return `<tr${v.id === "base" ? ' class="principal"' : ""}><td>${esc(v.id === "base" ? "Modelo base (error en pp)" : v.etiqueta.replace(/^\+\s*/, ""))}</td>${celdas}</tr>`;
      });
      $("#t-nuevas").innerHTML = tabla(["Dato sumado al modelo", ...base.horizonte.map((h) => `${h} m`)], filas) +
        '<p class="pie-grafico">Ningún dato nuevo mejora todos los plazos. La tasa real de política es la que más ayuda, y por eso entra en dos modelos candidatos.</p>';
    } else {
      $("#t-nuevas").innerHTML = '<p class="pie-grafico">El contraste de datos nuevos aparece al correr el estudio completo.</p>';
    }

    const plazos = [1, 3, 6, 12, 24];
    const modelos = Object.keys(D.nombres).filter((m) => D.metricas[m]);
    const mejor = plazos.map((h) => Math.min(...modelos.map((m) => D.metricas[m].rmse[h - 1])));
    const orden = modelos.slice().sort((a, b) => D.metricas[a].rmse[11] - D.metricas[b].rmse[11]);
    $("#t-modelos").innerHTML = tabla(
      ["Modelo", ...plazos.map((h) => `${h} ${h === 1 ? "mes" : "meses"}`), "Frente a tasa constante, 12 m"],
      orden.map((m) => {
        const razon = D.metricas[m].rmse[11] / paseo.rmse[11] - 1;
        const etiqueta = m === PRINCIPAL ? '<span class="etiqueta">Principal</span>' : ["ridge_real", "combinado"].includes(m) ? '<span class="etiqueta">Nuevo</span>' : "";
        return `<tr${m === PRINCIPAL ? ' class="principal"' : ""}><td>${esc(D.nombres[m])}${etiqueta}</td>${plazos
          .map((h, i) => `<td${Math.abs(D.metricas[m].rmse[h - 1] - mejor[i]) < 1e-9 ? ' class="mejor"' : ""}>${num(D.metricas[m].rmse[h - 1])}</td>`)
          .join("")}<td>${m === "paseo_aleatorio" ? "referencia" : `<span class="${razon < 0 ? "mejora" : "empeora"}">${signo(razon)}${num(Math.abs(razon) * 100, 0)} %</span>`}</td></tr>`;
      }),
    );
  }

  function pintarMetodo() {
    $("#t-fuentes").innerHTML = tabla(
      ["Serie", "Entidad", "Frecuencia"],
      D.fuentes.map((f) => `<tr><td><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.serie)}</a></td><td>${esc(f.entidad)}</td><td>${esc(f.frecuencia)}</td></tr>`),
    );
    const coeficientes = D.estudio.coeficientes;
    if (!coeficientes) return;
    const h = 12;
    const pares = Object.keys(coeficientes).map((variable) => ({ variable, valor: coeficientes[variable][h - 1] }));
    const tope = Math.max(...pares.map((p) => Math.abs(p.valor))) * 1.05;
    $("#coef-sub").textContent = `Puntos que mueve la proyección a ${h} meses cuando cada variable sube una desviación estándar`;
    $("#g-coef").innerHTML = pares.map((p) => {
      const ancho = (Math.abs(p.valor) / tope) * 50;
      const estilo = p.valor >= 0 ? `left:50%;width:${ancho}%` : `left:${50 - ancho}%;width:${ancho}%;border-radius:4px 0 0 4px`;
      return `<div class="barra-fila" data-tip="<b>${esc(D.etiquetas[p.variable] || p.variable)}</b><div><span>Efecto a ${h} meses</span><em>${pp(p.valor)}</em></div>">
        <span class="nombre">${esc(D.etiquetas[p.variable] || p.variable)}</span>
        <div class="pista"><div class="cero" style="left:50%"></div><div class="relleno${p.valor < 0 ? " neg" : ""}" style="${estilo}"></div></div>
        <span class="valor">${signo(p.valor)}${num(Math.abs(p.valor))}</span></div>`;
    }).join("") + '<p class="pie-grafico">Azul: empuja la tasa hacia arriba. Naranja: hacia abajo. M2 y M3 se mueven casi juntos, así que sus efectos por separado no deben leerse como causa.</p>';
  }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */

  function conectarInterfaz() {
    const raiz = document.documentElement;
    try {
      const guardado = localStorage.getItem("tasaviva-tema");
      if (guardado) raiz.dataset.theme = guardado;
    } catch (error) { /* sin almacenamiento */ }
    $("#tema").addEventListener("click", () => {
      const oscuro = raiz.dataset.theme ? raiz.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      raiz.dataset.theme = oscuro ? "light" : "dark";
      try { localStorage.setItem("tasaviva-tema", raiz.dataset.theme); } catch (error) { /* sin almacenamiento */ }
    });
    const enlaces = $$(".nav a");
    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        enlaces.forEach((a) => a.classList.toggle("activo", a.getAttribute("href") === `#${entrada.target.id}`));
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    $$("main section[id]").forEach((seccion) => observador.observe(seccion));
  }

  function pintarTodo() {
    pintarHeroe();
    pintarSimEstatico();
    pintarBancos();
    pintarSemanal();
    pintarTRM();
    pintarHistoria();
    pintarConfianza();
  }

  function arrancar() {
    conectarInterfaz();
    pintarTitular();
    pintarFichas();
    llenarControles();
    leerControles();
    conectarSim();
    conectarCredito();
    conectarHistoria();
    reiniciarSim();
    pintarCredito();
    pintarMetodo();
    pintarTodo();
    pintarChip();
    refrescarVivo();
    setInterval(refrescarVivo, REFRESCO_MS);
    setInterval(pintarReloj, 1000);
    let espera = null;
    let anchoPrevio = window.innerWidth;
    window.addEventListener("resize", () => {
      if (window.innerWidth === anchoPrevio) return;
      anchoPrevio = window.innerWidth;
      clearTimeout(espera);
      espera = setTimeout(pintarTodo, 150);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
