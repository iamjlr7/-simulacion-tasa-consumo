/* Vista «Simulador».
   Lo que se elige (modelo, plazo, condiciones) vive en el almacén, para que no
   se pierda al cambiar de vista. La animación es estado propio de esta vista:
   cambia decenas de veces por segundo y a nadie más le interesa. */

import {
  CONDICIONES_BASE, admiteCondiciones, condicionesActivas, condicionesDe, cuantil, episodios,
  modelosDisponibles, rmse, sendaCentral, sendaPrediccion, usaColumna,
} from "../dominio/modelo.js";
import { histograma } from "../graficos/histograma.js";
import { grafico, leyenda, poligono } from "../graficos/lineas.js";
import { D, FECHAS, HMAX, N, ORIGEN, P, PRINCIPAL, Y0, prediccion } from "../nucleo/datos.js";
import { $, MOVIMIENTO_REDUCIDO, crearLimpieza } from "../nucleo/dom.js";
import { clase, esc, flecha, mesAnio, mesCorto, ms, num, pct, pp, signo } from "../nucleo/formato.js";
import { icono } from "../nucleo/iconos.js";

const RECOMENDADOS = ["ridge_agregados", "combinado", "ridge_real", "paseo_aleatorio"];
const VELOCIDADES = [3, 8, 20, 45, 120]; // episodios por segundo

const PLANTILLA = `
  <div class="sim">
    <form class="tarjeta controles" id="controles" onsubmit="return false">
      <fieldset>
        <legend>Qué simular</legend>
        <label for="s-modelo">Modelo</label>
        <select id="s-modelo"></select>
        <p class="ayuda" id="s-modelo-ayuda"></p>
        <label for="s-h">Plazo: <output id="s-h-val"></output></label>
        <input id="s-h" type="range" min="1" max="24" step="1">
        <div class="marcas"><span>1 mes</span><span>12</span><span>24 meses</span></div>
      </fieldset>
      <fieldset id="condiciones">
        <legend>¿Y si las condiciones fueran otras?</legend>
        <label for="s-pol">Tasa de política: <output id="s-pol-val"></output></label>
        <input id="s-pol" type="range" min="-300" max="300" step="25">
        <div class="marcas"><span>−3 pp</span><span>hoy</span><span>+3 pp</span></div>
        <label for="s-m2">Crecimiento anual de M2: <output id="s-m2-val"></output></label>
        <input id="s-m2" type="range">
        <label for="s-inf">Inflación anual: <output id="s-inf-val"></output></label>
        <input id="s-inf" type="range">
        <p class="ayuda" id="s-cond-ayuda"></p>
        <button class="boton chico" type="button" id="s-restablecer">Volver a las condiciones reales</button>
      </fieldset>
      <fieldset>
        <legend>Reproducción</legend>
        <label for="s-vel">Velocidad</label>
        <input id="s-vel" type="range" min="1" max="5" step="1" value="3">
        <div class="marcas"><span>Lenta</span><span></span><span>Rápida</span></div>
        <div class="fila-botones">
          <button class="boton primario" type="button" id="s-play"></button>
          <button class="boton" type="button" id="s-reiniciar">${icono("reiniciar", 16)}Reiniciar</button>
        </div>
      </fieldset>
    </form>

    <div class="sim-principal">
      <div class="resultados" id="sim-resultados"></div>
      <div class="tarjeta">
        <div class="cabecera-grafico">
          <div>
            <strong>Tasa de crédito de consumo</strong>
            <span id="sim-sub"></span>
          </div>
          <div class="progreso">
            <span id="sim-cuenta"></span>
            <div class="progreso-barra"><i id="sim-barra"></i></div>
          </div>
        </div>
        <div class="leyenda" id="sim-leyenda"></div>
        <div class="grafico" id="g-sim"></div>
        <p class="pie-grafico" id="sim-episodio"></p>
      </div>
      <div class="tarjeta">
        <div class="cabecera-grafico">
          <div>
            <strong id="hist-titulo"></strong>
            <span id="hist-sub"></span>
          </div>
          <label class="umbral">Probabilidad de superar
            <input id="s-umbral" type="number" step="0.25" min="0" max="60"> % <b id="s-umbral-val"></b>
          </label>
        </div>
        <div class="grafico" id="g-hist"></div>
      </div>
    </div>
  </div>`;

function barajar(n) {
  const orden = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  return orden;
}

const cercano = (valor, base) => (Math.abs(valor - base) < 1e-3 ? base : valor);

export function montar(el, { almacen }) {
  const limpieza = crearLimpieza();
  el.innerHTML = PLANTILLA;
  const sim = () => almacen.obtener().sim;
  const cambiarSim = (parcial) => almacen.actualizar((estado) => ({ sim: { ...estado.sim, ...parcial } }));

  // Estado de la animación y de lo último que se dibujó.
  const anim = { orden: [], jugados: 0, corriendo: !MOVIMIENTO_REDUCIDO, acumulado: 0, previo: 0, cuadro: 0 };
  let lienzo = null;
  let central = [];
  let pred = [];

  /* ---------- Controles ---------- */

  function llenarControles() {
    const disponibles = modelosDisponibles();
    const grupo = (titulo, ids) => `<optgroup label="${titulo}">${ids.map((m) => `<option value="${m}">${esc(D.nombres[m])}${m === PRINCIPAL ? " (principal)" : ""}</option>`).join("")}</optgroup>`;
    const primeros = RECOMENDADOS.filter((m) => disponibles.includes(m));
    $("#s-modelo", el).innerHTML = grupo("Recomendados", primeros) + grupo("Otros modelos del estudio", disponibles.filter((m) => !primeros.includes(m)));
    // El mínimo se alinea con el valor real para que la rejilla del control
    // pase exactamente por él y «sin cambios» sea de verdad sin cambios.
    const alinear = (control, base, minimo, maximo, paso) => {
      control.step = paso;
      control.min = (base - Math.ceil((base - minimo) / paso) * paso).toFixed(4);
      control.max = (base + Math.ceil((maximo - base) / paso) * paso).toFixed(4);
    };
    const m2 = P.g_m2.filter((v) => v !== null);
    alinear($("#s-m2", el), CONDICIONES_BASE.m2, Math.min(...m2), Math.max(...m2), 0.5);
    alinear($("#s-inf", el), CONDICIONES_BASE.inf, 0, 15, 0.25);
    const s = sim();
    $("#s-modelo", el).value = s.modelo;
    $("#s-h", el).value = s.h;
    $("#s-pol", el).value = s.condiciones.dPol;
    $("#s-m2", el).value = s.condiciones.m2;
    $("#s-inf", el).value = s.condiciones.inf;
    $("#s-umbral", el).value = s.umbral;
  }

  function pintarEtiquetas() {
    const s = sim();
    const admite = admiteCondiciones(s.modelo);
    $("#condiciones", el).disabled = !admite;
    $("#s-m2", el).disabled = !admite || !usaColumna(s.modelo, "g_m2");
    $("#s-inf", el).disabled = !admite || !usaColumna(s.modelo, "tasa_real");
    $("#s-h-val", el).textContent = `${s.h} ${s.h === 1 ? "mes" : "meses"} · ${mesCorto(FECHAS[s.h - 1])}`;
    const real = (valor, base) => (Math.abs(valor - base) < 1e-9 ? " (real)" : "");
    const pol = P.pol[N - 1] + s.condiciones.dPol / 100;
    $("#s-pol-val", el).textContent = s.condiciones.dPol === 0 ? `${pct(pol)} (real)` : `${pct(pol)} (${signo(s.condiciones.dPol)}${Math.abs(s.condiciones.dPol)} pb)`;
    $("#s-m2-val", el).textContent = `${pct(s.condiciones.m2, 2)}${real(s.condiciones.m2, CONDICIONES_BASE.m2)}`;
    $("#s-inf-val", el).textContent = `${pct(s.condiciones.inf, 2)}${real(s.condiciones.inf, CONDICIONES_BASE.inf)}`;
    $("#s-cond-ayuda", el).textContent = admite
      ? `Cambia el punto de partida de ${mesAnio(ORIGEN)} y recalcula el modelo. No supone una senda futura de la política ni del dinero.`
      : "Este modelo no se recalcula en la página: usa la proyección ya estimada. Elige un modelo Ridge para probar otras condiciones.";
    const e12 = rmse(s.modelo, 12);
    const paseo12 = rmse("paseo_aleatorio", 12);
    const mejora = e12 !== null && paseo12 ? (1 - e12 / paseo12) * 100 : null;
    $("#s-modelo-ayuda", el).textContent = e12 === null ? "" :
      `Error típico a 12 meses: ${num(e12)} pp` +
      (s.modelo === "paseo_aleatorio" ? ". Es la referencia: suponer que la tasa no cambia."
        : mejora >= 0 ? `, ${num(mejora, 0)} % menos que suponer que la tasa no cambia.`
          : `, ${num(-mejora, 0)} % más que suponer que la tasa no cambia.`);
    pintarBotonPlay();
  }

  function pintarBotonPlay() {
    const terminado = anim.jugados >= anim.orden.length;
    $("#s-play", el).innerHTML = terminado ? `${icono("reiniciar", 16)}Repetir`
      : anim.corriendo ? `${icono("pausa", 16)}Pausar` : `${icono("reproducir", 16)}Continuar`;
  }

  /* ---------- Gráfico principal ---------- */

  function pintarEstatico() {
    const s = sim();
    const tipo = almacen.obtener().tipo;
    const condiciones = condicionesDe(s.modelo, s.condiciones);
    central = sendaCentral(s.modelo, condiciones);
    pred = sendaPrediccion(s.modelo, tipo, condiciones);
    const base = sendaPrediccion(s.modelo, tipo, CONDICIONES_BASE);
    const nombrePred = `Predicción ${prediccion(tipo).nombre.toLowerCase()}`;
    const cambiado = condicionesActivas(s.modelo, s.condiciones);
    const desde = N - 37;
    const t0 = ms(ORIGEN);
    const historia = P.fecha.slice(desde).map((f, i) => [ms(f), P.y[desde + i]]);
    let minimo = Math.min(...historia.map((p) => p[1]));
    let maximo = Math.max(...historia.map((p) => p[1]));
    episodios(s.modelo).e.forEach((fila) => fila.forEach((error, i) => {
      if (error === null) return;
      const v = central[i] + error;
      if (v < minimo) minimo = v;
      if (v > maximo) maximo = v;
    }));
    const series = [
      { nombre: "Observada", color: "var(--s1)", p: historia, ancho: 2.2 },
      { nombre: cambiado ? `${nombrePred} con tus cambios` : nombrePred, color: "var(--s1)", p: [[t0, Y0], ...FECHAS.map((f, i) => [ms(f), pred[i]])], ancho: 2.6, puntoFinal: true },
    ];
    if (cambiado) {
      series.push({ nombre: `${nombrePred} sin cambios`, color: "var(--neutro)", p: [[t0, Y0], ...FECHAS.map((f, i) => [ms(f), base[i]])], guion: "4 4", ancho: 1.6 });
    }
    const marcas = D.parcial?.tasa ? [{ t: ms(FECHAS[0]), v: D.parcial.tasa, color: "var(--s3)" }] : [];
    lienzo = grafico($("#g-sim", el), {
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
        { t: ms(FECHAS[s.h - 1]), texto: mesCorto(FECHAS[s.h - 1]), ancla: s.h > 18 ? "end" : "start" },
      ],
      tipExtra: (t) => {
        const i = FECHAS.findIndex((f) => ms(f) === t);
        const b = i >= 0 ? bandaEn(i) : null;
        return b ? `<div><span>Rango del 80 %</span><em>${num(b.q10, 1)} – ${num(b.q90, 1)} %</em></div>` : "";
      },
    });
    const items = [
      { nombre: "Observada", color: "var(--s1)" },
      { nombre: series[1].nombre, color: "var(--s1)" },
    ];
    if (cambiado) items.push({ nombre: `${nombrePred} sin cambios`, color: "var(--neutro)", tipo: "guion" });
    items.push(
      { nombre: "Futuros posibles", color: "var(--neutro)", tipo: "fino" },
      { nombre: "Rango del 80 % y del 95 %", color: "var(--s1)", tipo: "banda" },
    );
    if (marcas.length) items.push({ nombre: `${mesCorto(FECHAS[0])} con datos parciales`, color: "var(--s3)", tipo: "punto" });
    leyenda($("#sim-leyenda", el), items);
    $("#sim-sub", el).textContent = `${D.nombres[s.modelo]} · efectiva anual, promedio del mes`;
    pintarEtiquetas();
    pintarDinamico();
  }

  /* ---------- Capa animada: futuros y rango ---------- */

  // Valores de los futuros ya dibujados en el plazo i. Los episodios más
  // recientes aún no tienen resultado a plazos largos y no cuentan ahí.
  function valoresEn(i) {
    const todos = episodios(sim().modelo).e;
    const valores = [];
    for (let k = 0; k < anim.jugados; k += 1) {
      const error = todos[anim.orden[k]][i];
      if (error !== null) valores.push(central[i] + error);
    }
    return valores;
  }

  function bandaEn(i) {
    if (anim.jugados < 8) return null;
    const ordenados = valoresEn(i).sort((a, b) => a - b);
    if (ordenados.length < 8) return null;
    return { q025: cuantil(ordenados, 0.025), q10: cuantil(ordenados, 0.1), q90: cuantil(ordenados, 0.9), q975: cuantil(ordenados, 0.975) };
  }

  function pintarDinamico() {
    if (!lienzo?.capa) return;
    const { sx, sy } = lienzo;
    const todos = episodios(sim().modelo);
    const t0 = ms(ORIGEN);
    const tiempos = FECHAS.map(ms);
    let svg = "";
    const b95 = [[t0, Y0, Y0]];
    const b80 = [[t0, Y0, Y0]];
    for (let i = 0; i < HMAX; i += 1) {
      const b = bandaEn(i);
      if (!b) break;
      b95.push([tiempos[i], b.q025, b.q975]);
      b80.push([tiempos[i], b.q10, b.q90]);
    }
    if (b80.length > 1) {
      svg += `<polygon points="${poligono(b95, sx, sy)}" fill="var(--s1)" fill-opacity="0.09"/>`;
      svg += `<polygon points="${poligono(b80, sx, sy)}" fill="var(--s1)" fill-opacity="0.13"/>`;
    }
    const x0 = sx(t0).toFixed(1);
    const yInicio = sy(Y0).toFixed(1);
    for (let k = 0; k < anim.jugados; k += 1) {
      const fila = todos.e[anim.orden[k]];
      let d = `M${x0},${yInicio}`;
      for (let i = 0; i < HMAX && fila[i] !== null; i += 1) d += `L${sx(tiempos[i]).toFixed(1)},${sy(central[i] + fila[i]).toFixed(1)}`;
      const reciente = k === anim.jugados - 1 && anim.jugados < anim.orden.length;
      svg += reciente
        ? `<path d="${d}" fill="none" stroke="var(--s2)" stroke-width="1.8" stroke-linejoin="round"/>`
        : `<path d="${d}" fill="none" stroke="var(--neutro)" stroke-width="0.8" stroke-opacity="0.38" stroke-linejoin="round"/>`;
    }
    lienzo.capa.innerHTML = svg;

    const total = anim.orden.length;
    $("#sim-cuenta", el).textContent = `${anim.jugados} de ${total} episodios`;
    $("#sim-barra", el).style.width = `${total ? (anim.jugados / total) * 100 : 0}%`;
    if (anim.jugados > 0 && anim.jugados < total) {
      $("#sim-episodio", el).innerHTML = `Línea naranja: la proyección de hoy con el error que el modelo tuvo al pronosticar desde <b>${mesAnio(todos.origen[anim.orden[anim.jugados - 1]])}</b>.`;
    } else if (total) {
      $("#sim-episodio", el).textContent = `Listo: ${total} episodios, uno por cada mes entre ${mesAnio(todos.origen[0])} y ${mesAnio(todos.origen[total - 1])} en que se puso a prueba el modelo. Las líneas cortas son los meses más recientes, que aún no completan 24 meses de resultado.`;
    }
    pintarResultados();
  }

  /* ---------- Cifras e histograma ---------- */

  function pintarResultados() {
    const s = sim();
    const i = s.h - 1;
    const elegida = prediccion(almacen.obtener().tipo);
    const valor = pred[i];
    const valores = valoresEn(i);
    const ordenados = valores.slice().sort((a, b) => a - b);
    const hay = valores.length >= 8;
    const suben = valores.filter((v) => v > Y0).length;
    const sobre = valores.filter((v) => v > s.umbral).length;
    const cambio = valor - Y0;
    const error = rmse(s.modelo, s.h);
    const errorPaseo = rmse("paseo_aleatorio", s.h);
    const fecha = mesAnio(FECHAS[i]);
    $("#sim-resultados", el).innerHTML = `
      <div class="dato elegida"><span>Predicción ${esc(elegida.nombre.toLowerCase())} en ${fecha}</span><strong>${pct(valor)}</strong>
        <small><b class="${clase(cambio)}">${flecha(cambio)} ${pp(cambio)}</b> frente a hoy (${pct(Y0)})</small></div>
      <div class="dato"><span>Rango probable (80 %)</span><strong>${hay ? `${num(cuantil(ordenados, 0.1), 1)} – ${num(cuantil(ordenados, 0.9), 1)} %` : "…"}</strong>
        <small>8 de cada 10 futuros simulados terminan aquí</small></div>
      <div class="dato"><span>Probabilidad de que suba</span><strong>${hay ? `${num((suben / valores.length) * 100, 0)} %` : "…"}</strong>
        <small>${suben} de ${valores.length} futuros quedan por encima de hoy</small></div>
      <div class="dato"><span>Error típico a este plazo</span><strong>${error === null ? "—" : `±${num(error)} pp`}</strong>
        <small>${errorPaseo ? `Suponer tasa constante falla ±${num(errorPaseo)} pp` : ""}</small></div>`;
    $("#hist-titulo", el).textContent = `Dónde termina la tasa en ${fecha}`;
    $("#hist-sub", el).textContent = `Cada barra cuenta cuántos de los ${valores.length} futuros simulados caen en ese tramo. En naranja, los que superan ${pct(s.umbral, 2)}.`;
    $("#s-umbral-val", el).textContent = valores.length ? `= ${num((sobre / valores.length) * 100, 0)} %` : "";

    const todos = episodios(s.modelo).e;
    let minimo = Y0;
    let maximo = Y0;
    todos.forEach((fila) => {
      if (fila[i] === null) return;
      const v = central[i] + fila[i];
      if (v < minimo) minimo = v;
      if (v > maximo) maximo = v;
    });
    histograma($("#g-hist", el), valores, {
      dominio: [minimo, maximo], total: todos.length, umbral: s.umbral, hoy: Y0, marca: valor, nombreMarca: elegida.nombre,
    });
  }

  /* ---------- Animación ---------- */

  function reiniciar() {
    anim.orden = barajar(episodios(sim().modelo).e.length);
    anim.jugados = MOVIMIENTO_REDUCIDO ? anim.orden.length : 0;
    anim.acumulado = 0;
    pintarEstatico();
  }

  function cuadro(ahora) {
    if (anim.corriendo && anim.jugados < anim.orden.length) {
      const paso = Math.min(0.1, (ahora - anim.previo) / 1000);
      anim.acumulado += paso * VELOCIDADES[Number($("#s-vel", el).value) - 1];
      const nuevos = Math.floor(anim.acumulado);
      if (nuevos > 0) {
        anim.acumulado -= nuevos;
        anim.jugados = Math.min(anim.orden.length, anim.jugados + nuevos);
        pintarDinamico();
        if (anim.jugados >= anim.orden.length) pintarBotonPlay();
      }
    }
    anim.previo = ahora;
    anim.cuadro = requestAnimationFrame(cuadro);
  }

  /* ---------- Conexiones ---------- */

  $("#s-modelo", el).addEventListener("change", (evento) => cambiarSim({ modelo: evento.target.value }));
  $("#s-h", el).addEventListener("input", (evento) => cambiarSim({ h: Number(evento.target.value) }));
  const leerCondiciones = () => cambiarSim({
    condiciones: {
      dPol: Number($("#s-pol", el).value),
      m2: cercano(Number($("#s-m2", el).value), CONDICIONES_BASE.m2),
      inf: cercano(Number($("#s-inf", el).value), CONDICIONES_BASE.inf),
    },
  });
  ["#s-pol", "#s-m2", "#s-inf"].forEach((id) => $(id, el).addEventListener("input", leerCondiciones));
  $("#s-umbral", el).addEventListener("input", (evento) => {
    const umbral = Number(evento.target.value);
    if (Number.isFinite(umbral)) cambiarSim({ umbral });
  });
  $("#s-restablecer", el).addEventListener("click", () => {
    $("#s-pol", el).value = 0;
    $("#s-m2", el).value = CONDICIONES_BASE.m2;
    $("#s-inf", el).value = CONDICIONES_BASE.inf;
    cambiarSim({ condiciones: { ...CONDICIONES_BASE } });
  });
  $("#s-play", el).addEventListener("click", () => {
    if (anim.jugados >= anim.orden.length) { anim.corriendo = true; reiniciar(); return; }
    anim.corriendo = !anim.corriendo;
    pintarBotonPlay();
  });
  $("#s-reiniciar", el).addEventListener("click", () => { anim.corriendo = true; reiniciar(); });

  limpieza.agregar(almacen.suscribir((estado) => [estado.tipo, estado.sim], ([, nueva], [, anterior]) => {
    // Otro modelo trae otros errores: la simulación empieza de nuevo.
    if (nueva.modelo !== anterior.modelo) { anim.corriendo = !MOVIMIENTO_REDUCIDO; reiniciar(); return; }
    // Si solo cambió el umbral, basta con recontar.
    if (nueva.umbral !== anterior.umbral && nueva.h === anterior.h && nueva.condiciones === anterior.condiciones) { pintarResultados(); return; }
    pintarEstatico();
  }));

  llenarControles();
  reiniciar();
  anim.cuadro = requestAnimationFrame(cuadro);
  limpieza.agregar(() => cancelAnimationFrame(anim.cuadro));

  return { desmontar: limpieza.ejecutar, redibujar: pintarEstatico };
}
