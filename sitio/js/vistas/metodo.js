/* Vista «Método»: cómo funciona el modelo, de dónde salen los datos y cómo
   está construida la aplicación. */

import { D } from "../nucleo/datos.js";
import { $ } from "../nucleo/dom.js";
import { esc, num, pp, signo } from "../nucleo/formato.js";
import { icono } from "../nucleo/iconos.js";

const PASOS = [
  ["Datos oficiales", "Series del Banco de la República, la Superintendencia Financiera y la Reserva Federal se llevan a una sola tabla mensual desde mayo de 2002."],
  ["Un modelo por plazo", "Para cada plazo de 1 a 24 meses, una regresión Ridge aprende cuánto suele cambiar la tasa según su inercia, su distancia frente a la tasa de política y el crecimiento del dinero."],
  ["Examen sin trampa", "Se repite el pronóstico en cada mes desde 2012 con la información de ese momento y se compara con lo que ocurrió. De ahí salen los errores."],
  ["Simulación", "Esos errores reales se aplican a la proyección de hoy. El resultado no es una cifra, es un abanico de futuros posibles con su probabilidad."],
];

const CAPAS = [
  ["Vistas", "Una por sección. Se descargan cuando se abren."],
  ["Aplicación", "Menú, barra superior y rutas."],
  ["Estado", "Un solo almacén: lo que elegiste y lo que llegó en vivo."],
  ["Dominio", "El modelo y las cuentas, como funciones puras."],
  ["Servicios", "Fuentes en vivo y descarga en Excel."],
];

const PLANTILLA = `
  <ol class="pasos-metodo">
    ${PASOS.map(([titulo, texto], i) => `<li class="tarjeta"><b>${i + 1}</b><h3>${titulo}</h3><p>${texto}</p></li>`).join("")}
  </ol>
  <div class="rejilla dos">
    <div class="tarjeta">
      <div class="cabecera-grafico"><div><strong>Qué pesa en el modelo</strong><span id="coef-sub"></span></div></div>
      <div id="g-coef" class="barras"></div>
    </div>
    <div class="tarjeta">
      <div class="cabecera-grafico"><div><strong>Límites que conviene conocer</strong><span>Lo que el modelo no puede decirte</span></div></div>
      <ul class="lista">
        <li>Es una proyección estadística: describe lo que suele pasar, no lo que va a pasar.</li>
        <li>No anticipa decisiones futuras del Banco de la República ni choques inesperados.</li>
        <li>El rango se ensancha con el plazo: a 12 meses la incertidumbre es alta.</li>
        <li>La predicción optimista y la pesimista no son límites: la tasa puede salirse de ese rango.</li>
        <li>El control de condiciones cambia el punto de partida; no supone una senda futura.</li>
      </ul>
    </div>
  </div>
  <div class="rejilla dos">
    <div class="tarjeta">
      <div class="cabecera-grafico"><div><strong>Fuentes</strong><span>Todas públicas y oficiales</span></div></div>
      <div class="tabla-envoltura" id="t-fuentes"></div>
    </div>
    <div class="tarjeta">
      <div class="cabecera-grafico"><div><strong>Cómo está construida la aplicación</strong><span>Por capas: cada una solo conoce a las de abajo</span></div></div>
      <ol class="capas">
        ${CAPAS.map(([nombre, texto]) => `<li><span>${icono("capas", 16)}<b>${nombre}</b></span><small>${texto}</small></li>`).join("")}
      </ol>
      <p class="pie-grafico">Sin librerías ni servidor propio: todo corre en tu navegador. Funciona sin conexión con los últimos datos guardados y se puede instalar como aplicación.</p>
    </div>
  </div>`;

export function montar(el) {
  el.innerHTML = PLANTILLA;

  $("#t-fuentes", el).innerHTML = `<table><thead><tr><th>Serie</th><th>Entidad</th><th>Frecuencia</th></tr></thead><tbody>${
    D.fuentes.map((f) => `<tr><td><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.serie)}</a></td><td>${esc(f.entidad)}</td><td>${esc(f.frecuencia)}</td></tr>`).join("")
  }</tbody></table>`;

  const coeficientes = D.estudio?.coeficientes;
  if (coeficientes) {
    const h = 12;
    const pares = Object.keys(coeficientes).map((variable) => ({ variable, valor: coeficientes[variable][h - 1] }));
    const tope = Math.max(...pares.map((p) => Math.abs(p.valor))) * 1.05;
    $("#coef-sub", el).textContent = `Puntos que mueve la proyección a ${h} meses cuando cada dato sube una desviación estándar`;
    $("#g-coef", el).innerHTML = pares.map((p) => {
      const ancho = (Math.abs(p.valor) / tope) * 50;
      const estilo = p.valor >= 0 ? `left:50%;width:${ancho}%` : `left:${50 - ancho}%;width:${ancho}%;border-radius:4px 0 0 4px`;
      const nombre = esc(D.etiquetas[p.variable] || p.variable);
      return `<div class="barra-fila" data-tip="<b>${nombre}</b><div><span>Efecto a ${h} meses</span><em>${pp(p.valor)}</em></div>">
        <span class="nombre">${nombre}</span>
        <div class="pista"><div class="cero" style="left:50%"></div><div class="relleno${p.valor < 0 ? " neg" : ""}" style="${estilo}"></div></div>
        <span class="valor">${signo(p.valor)}${num(Math.abs(p.valor))}</span></div>`;
    }).join("") + '<p class="pie-grafico">Azul: empuja la tasa hacia arriba. Naranja: hacia abajo. M2 y M3 se mueven casi juntos, así que sus efectos por separado no deben leerse como causa.</p>';
  }
  return {};
}
