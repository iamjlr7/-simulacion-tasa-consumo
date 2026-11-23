/* Vista «Mercado en vivo»: lo que cobraron las entidades esta semana. */

import { ordenarEntidades, promedioSistema, ultimo } from "../dominio/mercado.js";
import { grafico, leyenda } from "../graficos/lineas.js";
import { D } from "../nucleo/datos.js";
import { $, $$, crearLimpieza } from "../nucleo/dom.js";
import { diaCorto, esc, ms, num, pct, pesosCortos, signo } from "../nucleo/formato.js";

const PLANTILLA = `
  <div class="rejilla dos">
    <div class="tarjeta">
      <div class="cabecera-grafico">
        <div>
          <strong>Tasa de libre inversión por entidad</strong>
          <span id="bancos-sub"></span>
        </div>
        <div class="segmento" id="orden" role="group" aria-label="Orden">
          <button type="button" data-orden="monto">Más desembolsos</button>
          <button type="button" data-orden="tasa">Menor tasa</button>
        </div>
      </div>
      <div id="g-bancos" class="barras"></div>
      <p class="pie-grafico" id="bancos-pie"></p>
    </div>
    <div class="columna">
      <div class="tarjeta">
        <div class="cabecera-grafico">
          <div>
            <strong>Semana a semana</strong>
            <span>Libre inversión (Superintendencia) frente a consumo total (Banco de la República)</span>
          </div>
        </div>
        <div class="leyenda" id="sem-leyenda"></div>
        <div class="grafico" id="g-semanal"></div>
      </div>
      <div class="tarjeta">
        <div class="cabecera-grafico">
          <div>
            <strong>Dólar (TRM), último año</strong>
            <span id="trm-sub">Pesos por dólar</span>
          </div>
        </div>
        <div class="grafico" id="g-trm"></div>
      </div>
    </div>
  </div>`;

export function montar(el, { almacen }) {
  const limpieza = crearLimpieza();
  el.innerHTML = PLANTILLA;

  function pintarBancos() {
    const { vivo, mercado } = almacen.obtener();
    const entidades = vivo.bancos.entidades;
    const destino = $("#g-bancos", el);
    $$("#orden button", el).forEach((boton) => boton.classList.toggle("activo", boton.dataset.orden === mercado.orden));
    if (!entidades.length) { destino.innerHTML = '<p class="pie-grafico">Sin datos de entidades.</p>'; return; }
    const sistema = promedioSistema(entidades);
    const usura = vivo.usura.usura || 0;
    const lista = ordenarEntidades(entidades, mercado.orden);
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
    $("#bancos-sub", el).textContent = `Semana al ${diaCorto(vivo.bancos.corte)} · ${entidades.length} entidades · ${pesosCortos(sistema.monto)} desembolsados`;
    $("#bancos-pie", el).textContent =
      (mercado.orden === "tasa" ? "Entidades con al menos 50 créditos en la semana, de menor a mayor tasa. " : "Las 14 entidades que más prestaron en la semana. ") +
      (usura ? `La raya vertical marca el tope legal (${pct(usura)}). ` : "") +
      "Tasa efectiva anual promedio ponderada por monto. Fuente: Superintendencia Financiera.";
  }

  function pintarSemanal() {
    const semanal = D.mercado.semanal;
    if (!semanal) return;
    const libre = semanal.fecha.map((f, i) => [ms(f), semanal.tasa[i]]);
    const inicio = libre[0][0] - 7 * 86400000;
    const consumo = D.semanal.fecha.map((f, i) => [ms(f), D.semanal.y[i]]).filter(([t]) => t >= inicio);
    const series = [
      { nombre: "Libre inversión (Superintendencia)", color: "var(--s2)", p: libre, puntoFinal: true },
      { nombre: "Consumo total (Banco de la República)", color: "var(--s1)", p: consumo, puntoFinal: true },
    ];
    grafico($("#g-semanal", el), { titulo: "Tasas semanales de libre inversión y de consumo", alto: 230, series, xFmt: (t) => `Semana al ${diaCorto(t)}` });
    leyenda($("#sem-leyenda", el), series);
  }

  function pintarTRM() {
    const serie = almacen.obtener().vivo.trm.serie;
    if (!serie.length) return;
    const final = ultimo(serie);
    const reciente = serie.filter(([t]) => t >= final[0] - 366 * 86400000);
    const variacion = (final[1] / reciente[0][1] - 1) * 100;
    $("#trm-sub", el).textContent = `Pesos por dólar · ${signo(variacion)}${num(Math.abs(variacion), 1)} % en doce meses`;
    grafico($("#g-trm", el), {
      titulo: "TRM del último año",
      alto: 200,
      margenDer: 16,
      series: [{ nombre: "TRM", color: "var(--s6)", p: reciente, puntoFinal: true }],
      yFmt: (v) => num(v, 0),
      vFmt: (v) => `$ ${num(v, 2)}`,
      xFmt: diaCorto,
    });
  }

  $("#orden", el).addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-orden]");
    if (boton) almacen.actualizar({ mercado: { orden: boton.dataset.orden } });
  });

  const pintar = () => { pintarBancos(); pintarSemanal(); pintarTRM(); };
  pintar();
  limpieza.agregar(almacen.suscribir((estado) => [estado.vivo.bancos, estado.vivo.usura, estado.mercado], pintarBancos));
  limpieza.agregar(almacen.suscribir((estado) => estado.vivo.trm, pintarTRM));
  return { desmontar: limpieza.ejecutar, redibujar: pintar };
}
