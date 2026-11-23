/* Vista «Tu crédito»: qué significa la predicción para una cuota. */

import { casosCredito } from "../dominio/credito.js";
import { FECHAS, prediccion } from "../nucleo/datos.js";
import { $, crearLimpieza } from "../nucleo/dom.js";
import { clase, esc, mesAnio, meses, pct, pesos } from "../nucleo/formato.js";

const PLAZOS = [1, 3, 6, 12, 18, 24];

const PLANTILLA = `
  <div class="credito">
    <form class="tarjeta controles" onsubmit="return false">
      <fieldset>
        <legend>Tu crédito</legend>
        <label for="c-monto">Monto</label>
        <div class="campo-moneda"><span>$</span><input id="c-monto" type="text" inputmode="numeric" autocomplete="off"></div>
        <label for="c-plazo">Plazo: <output id="c-plazo-val"></output></label>
        <input id="c-plazo" type="range" min="6" max="84" step="6">
        <div class="marcas"><span>6 meses</span><span></span><span>7 años</span></div>
        <label for="c-cuando">¿Cuándo lo pedirías?</label>
        <select id="c-cuando">${PLAZOS.map((h) => `<option value="${h}">En ${meses(h)} (${mesAnio(FECHAS[h - 1])})</option>`).join("")}</select>
      </fieldset>
      <p class="ayuda">La tasa promedio del mercado no es la que te ofrecerá tu banco: depende de tu perfil. Úsala como referencia de hacia dónde va el costo.</p>
    </form>
    <div class="credito-salida" id="c-salida"></div>
  </div>`;

export function montar(el, { almacen }) {
  const limpieza = crearLimpieza();
  el.innerHTML = PLANTILLA;
  const cambiar = (parcial) => almacen.actualizar((estado) => ({ credito: { ...estado.credito, ...parcial } }));

  const inicial = almacen.obtener().credito;
  $("#c-monto", el).value = inicial.monto ? inicial.monto.toLocaleString("es-CO") : "";
  $("#c-plazo", el).value = inicial.plazo;
  $("#c-cuando", el).value = inicial.cuando;

  function pintar() {
    const { tipo, credito, vivo } = almacen.obtener();
    const { monto, plazo, cuando } = credito;
    const anios = plazo / 12;
    $("#c-plazo-val", el).textContent = `${plazo} meses${plazo % 12 === 0 ? ` (${anios} ${anios === 1 ? "año" : "años"})` : ""}`;
    const salida = $("#c-salida", el);
    if (!monto) {
      salida.innerHTML = '<div class="tarjeta">Escribe un monto para calcular la cuota.</div>';
      return;
    }
    const usura = vivo.usura.usura;
    const casos = casosCredito({ monto, plazo, cuando, tipo, usura });
    const hoy = casos.find((c) => c.id === "hoy");
    const elegido = casos.find((c) => c.elegida);
    const otros = casos.filter((c) => !c.elegida && c.id !== "hoy" && c.id !== "usura");
    const tope = casos.find((c) => c.id === "usura");
    const nombre = `predicción ${prediccion(tipo).nombre.toLowerCase()}`;
    const tarjeta = (titulo, caso, extra, destacada) => `
      <div class="tarjeta cuota${destacada ? " destacada" : ""}">
        <h3>${titulo}</h3>
        <p class="grande">${pesos(caso.cuota)} <small>al mes</small></p>
        <dl>
          <dt>Tasa efectiva anual</dt><dd>${pct(caso.tasa)}</dd>
          <dt>Intereses en todo el crédito</dt><dd>${pesos(caso.intereses)}</dd>
          <dt>Total que pagarías</dt><dd>${pesos(caso.total)}</dd>
          ${extra}
        </dl>
      </div>`;
    const diferencia = elegido.diferencia;
    salida.innerHTML = `
      <div class="cuotas">
        ${tarjeta("Si lo pides hoy", hoy, "", false)}
        ${tarjeta(`Si lo pides en ${mesAnio(FECHAS[cuando - 1])} · ${esc(nombre)}`, elegido,
          otros.map((c) => `<dt>Cuota con la ${esc(prediccion(c.id).nombre.toLowerCase())}</dt><dd>${pesos(c.cuota)}</dd>`).join(""), true)}
      </div>
      <div class="tarjeta veredicto">
        ${Math.abs(diferencia) < 1
          ? `Con la ${esc(nombre)}, la cuota sería prácticamente la misma.`
          : `Según la ${esc(nombre)}, esperar ${meses(cuando)} ${diferencia > 0 ? "encarecería" : "abarataría"} la cuota en unos
             <b class="${clase(diferencia)}">${pesos(Math.abs(diferencia))} al mes</b>
             (${pesos(Math.abs(diferencia) * plazo)} en todo el crédito). Es una estimación: cambia de predicción, arriba, para ver los otros dos casos.`}
      </div>
      ${tope ? `<div class="tarjeta tope"><span><b>Tope legal vigente: ${pct(usura)} efectiva anual.</b>
        Ninguna entidad puede cobrarte más que la tasa de usura en un crédito de consumo. A esa tasa, la cuota de este crédito sería ${pesos(tope.cuota)} al mes.</span></div>` : ""}`;
  }

  $("#c-monto", el).addEventListener("input", (evento) => {
    const limpio = evento.target.value.replace(/[^\d]/g, "").slice(0, 12);
    evento.target.value = limpio ? Number(limpio).toLocaleString("es-CO") : "";
    cambiar({ monto: Number(limpio) || 0 });
  });
  $("#c-plazo", el).addEventListener("input", (evento) => cambiar({ plazo: Number(evento.target.value) }));
  $("#c-cuando", el).addEventListener("change", (evento) => cambiar({ cuando: Number(evento.target.value) }));

  pintar();
  limpieza.agregar(almacen.suscribir((estado) => [estado.tipo, estado.credito, estado.vivo.usura], pintar));
  return { desmontar: limpieza.ejecutar };
}
