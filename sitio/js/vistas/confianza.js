/* Vista «Confiabilidad»: cuánto se equivoca el modelo y frente a qué. */

import { grafico, leyenda } from "../graficos/lineas.js";
import { D, HMAX, PRINCIPAL } from "../nucleo/datos.js";
import { $ } from "../nucleo/dom.js";
import { esc, num, signo } from "../nucleo/formato.js";

const PLANTILLA = `
  <p class="entrada">El modelo se puso a prueba mes a mes desde mayo de 2012, usando en cada fecha solo lo que se sabía entonces. Esto es lo que acertó y lo que no.</p>
  <div class="resultados" id="conf-fichas"></div>
  <div class="rejilla dos">
    <div class="tarjeta">
      <div class="cabecera-grafico"><div><strong>Error típico según el plazo</strong><span>Puntos porcentuales (RMSE). Más abajo es mejor.</span></div></div>
      <div class="leyenda" id="rmse-leyenda"></div>
      <div class="grafico" id="g-rmse"></div>
    </div>
    <div class="tarjeta">
      <div class="cabecera-grafico"><div><strong>¿Los datos nuevos mejoran el pronóstico?</strong><span>Cambio del error al sumar cada dato al modelo base. Verde: mejora.</span></div></div>
      <div class="tabla-envoltura" id="t-nuevas"></div>
    </div>
  </div>
  <div class="tarjeta">
    <div class="cabecera-grafico"><div><strong>Todos los modelos comparados</strong><span>Error típico en puntos porcentuales, del mismo ejercicio. El menor de cada plazo va resaltado.</span></div></div>
    <div class="tabla-envoltura" id="t-modelos"></div>
  </div>`;

const tabla = (cabeza, filas) =>
  `<table><thead><tr>${cabeza.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${filas.join("")}</tbody></table>`;

export function montar(el) {
  el.innerHTML = PLANTILLA;
  const metricas = D.metricas[PRINCIPAL];
  const paseo = D.metricas.paseo_aleatorio;
  const cobertura = D.cobertura[PRINCIPAL];

  const dato = (h) => `<div class="dato"><span>Error típico a ${h} ${h === 1 ? "mes" : "meses"}</span><strong>±${num(metricas.rmse[h - 1])} pp</strong>
    <small>${num((1 - metricas.rmse[h - 1] / paseo.rmse[h - 1]) * 100, 0)} % menos que suponer tasa constante (±${num(paseo.rmse[h - 1])} pp)</small></div>`;
  $("#conf-fichas", el).innerHTML = dato(1) + dato(6) + dato(12) +
    `<div class="dato"><span>Aciertos reales del rango del 80 %</span><strong>${num(cobertura.c80[11] * 100, 0)} %</strong>
     <small>A 12 meses el dato cayó dentro del rango menos de lo prometido (${num(cobertura.c80[0] * 100, 0)} % a 1 mes): tómalo como un rango optimista.</small></div>`;

  function pintarGrafico() {
    const horizontes = Array.from({ length: HMAX }, (_, i) => i + 1);
    const lineas = [
      { id: "paseo_aleatorio", color: "var(--neutro)", ancho: 1.8, guion: "5 4", tipo: "guion" },
      { id: PRINCIPAL, color: "var(--s1)", ancho: 2.4 },
    ].filter((l) => D.metricas[l.id]).map((l) => ({ ...l, nombre: D.nombres[l.id], p: horizontes.map((h) => [h, D.metricas[l.id].rmse[h - 1]]) }));
    grafico($("#g-rmse", el), {
      titulo: "Error típico por plazo",
      alto: 270,
      desdeCero: true,
      series: lineas,
      xTicks: [1, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => ({ t: h, texto: h === 1 ? "1 mes" : String(h) })),
      xFmt: (h) => `Plazo de ${h} ${h === 1 ? "mes" : "meses"}`,
      vFmt: (v) => `±${num(v)} pp`,
    });
    leyenda($("#rmse-leyenda", el), lineas);
  }
  pintarGrafico();

  const nuevas = D.variables_nuevas ?? [];
  const base = nuevas.find((v) => v.id === "base");
  if (base) {
    const filas = nuevas.map((v) => {
      const celdas = v.rmse.map((valor, i) => {
        if (v.id === "base") return `<td>${num(valor)}</td>`;
        const d = valor - base.rmse[i];
        const tipo = d < -0.005 ? "mejora" : d > 0.005 ? "empeora" : "neutro";
        return `<td><span class="${tipo}">${signo(d)}${num(Math.abs(d))}</span></td>`;
      }).join("");
      return `<tr${v.id === "base" ? ' class="principal"' : ""}><td>${esc(v.id === "base" ? "Modelo base (error en pp)" : v.etiqueta.replace(/^\+\s*/, ""))}</td>${celdas}</tr>`;
    });
    $("#t-nuevas", el).innerHTML = tabla(["Dato sumado al modelo", ...base.horizonte.map((h) => `${h} m`)], filas) +
      '<p class="pie-grafico">Ningún dato nuevo mejora todos los plazos. La tasa real de política es la que más ayuda, y por eso entra en dos modelos candidatos.</p>';
  } else {
    $("#t-nuevas", el).innerHTML = '<p class="pie-grafico">El contraste de datos nuevos aparece al correr el estudio completo.</p>';
  }

  const plazos = [1, 3, 6, 12, 24];
  const modelos = Object.keys(D.nombres).filter((m) => D.metricas[m]);
  const mejor = plazos.map((h) => Math.min(...modelos.map((m) => D.metricas[m].rmse[h - 1])));
  const orden = modelos.slice().sort((a, b) => D.metricas[a].rmse[11] - D.metricas[b].rmse[11]);
  $("#t-modelos", el).innerHTML = tabla(
    ["Modelo", ...plazos.map((h) => `${h} ${h === 1 ? "mes" : "meses"}`), "Frente a tasa constante, 12 m"],
    orden.map((m) => {
      const razon = D.metricas[m].rmse[11] / paseo.rmse[11] - 1;
      const etiqueta = m === PRINCIPAL ? '<span class="etiqueta">Principal</span>' : ["ridge_real", "combinado"].includes(m) ? '<span class="etiqueta">Nuevo</span>' : "";
      return `<tr${m === PRINCIPAL ? ' class="principal"' : ""}><td>${esc(D.nombres[m])}${etiqueta}</td>${plazos
        .map((h, i) => `<td${Math.abs(D.metricas[m].rmse[h - 1] - mejor[i]) < 1e-9 ? ' class="mejor"' : ""}>${num(D.metricas[m].rmse[h - 1])}</td>`)
        .join("")}<td>${m === "paseo_aleatorio" ? "referencia" : `<span class="${razon < 0 ? "mejora" : "empeora"}">${signo(razon)}${num(Math.abs(razon) * 100, 0)} %</span>`}</td></tr>`;
    }),
  );

  return { redibujar: pintarGrafico };
}
