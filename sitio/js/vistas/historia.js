/* Vista «Historia»: la tasa y lo que la mueve desde 2002. */

import { grafico, leyenda } from "../graficos/lineas.js";
import { ORIGEN, P } from "../nucleo/datos.js";
import { $, $$, crearLimpieza } from "../nucleo/dom.js";
import { ms, num, partes } from "../nucleo/formato.js";

// El color sigue a la serie, no a su posición: al ocultar una, las demás no cambian de color.
const SERIES = [
  { id: "y", nombre: "Crédito de consumo", color: "var(--s1)" },
  { id: "pol", nombre: "Tasa de política", color: "var(--s2)" },
  { id: "usura", nombre: "Tope legal (usura)", color: "var(--s3)" },
  { id: "inflacion", nombre: "Inflación anual", color: "var(--s4)" },
  { id: "fed", nombre: "Tasa de la Fed", color: "var(--s5)" },
].filter((serie) => P[serie.id]);

const DINERO = [
  { id: "g_m1", nombre: "M1 (efectivo y cuentas corrientes)", color: "var(--s1)" },
  { id: "g_m2", nombre: "M2 (más ahorros y CDT)", color: "var(--s2)" },
  { id: "g_m3", nombre: "M3 (todo lo anterior y otros depósitos)", color: "var(--s3)" },
];

const PLANTILLA = `
  <div class="tarjeta">
    <div class="cabecera-grafico">
      <div class="chips" id="h-series" role="group" aria-label="Series visibles">
        ${SERIES.map((s) => `<button type="button" class="chip" data-serie="${s.id}" style="--c:${s.color}"><i></i>${s.nombre}</button>`).join("")}
      </div>
      <div class="segmento" id="h-rango" role="group" aria-label="Periodo">
        <button type="button" data-anios="5">5 años</button>
        <button type="button" data-anios="10">10 años</button>
        <button type="button" data-anios="0">Todo</button>
      </div>
    </div>
    <div class="grafico" id="g-historia"></div>
    <p class="pie-grafico">Porcentaje anual. Pasa el cursor para leer cada mes.</p>
  </div>
  <div class="rejilla dos">
    <div class="tarjeta">
      <div class="cabecera-grafico"><div><strong>Dinero en circulación</strong><span>Crecimiento anual de M1, M2 y M3, en porcentaje</span></div></div>
      <div class="leyenda" id="dinero-leyenda"></div>
      <div class="grafico" id="g-dinero"></div>
    </div>
    <div class="tarjeta">
      <div class="cabecera-grafico"><div><strong>Dólar (TRM)</strong><span>Promedio mensual, pesos por dólar</span></div></div>
      <div class="grafico" id="g-trm-hist"></div>
    </div>
  </div>`;

export function montar(el, { almacen }) {
  const limpieza = crearLimpieza();
  el.innerHTML = PLANTILLA;
  const cambiar = (parcial) => almacen.actualizar((estado) => ({ historia: { ...estado.historia, ...parcial } }));

  function pintar() {
    const { anios, series } = almacen.obtener().historia;
    const [anioFin, mesFin] = partes(ms(ORIGEN));
    const limite = anios ? Date.UTC(anioFin - anios, mesFin, 1) : -Infinity;
    const recorte = (campo) => P.fecha.map((f, i) => [ms(f), P[campo][i]]).filter(([t]) => t >= limite);

    $$("#h-series [data-serie]", el).forEach((boton) => boton.setAttribute("aria-pressed", String(series.includes(boton.dataset.serie))));
    $$("#h-rango button", el).forEach((boton) => boton.classList.toggle("activo", Number(boton.dataset.anios) === anios));

    grafico($("#g-historia", el), {
      titulo: "Historia de la tasa de consumo y sus determinantes",
      alto: 360,
      desdeCero: true,
      series: SERIES.filter((s) => series.includes(s.id)).map((s) => ({ nombre: s.nombre, color: s.color, p: recorte(s.id), ancho: s.id === "y" ? 2.4 : 1.8 })),
    });
    grafico($("#g-dinero", el), {
      titulo: "Crecimiento anual de los agregados monetarios",
      alto: 230,
      series: DINERO.map((s) => ({ nombre: s.nombre, color: s.color, p: recorte(s.id), ancho: 1.8 })),
      lineasH: [{ v: 0 }],
    });
    leyenda($("#dinero-leyenda", el), DINERO);
    if (P.trm) {
      grafico($("#g-trm-hist", el), {
        titulo: "TRM promedio mensual",
        alto: 230,
        series: [{ nombre: "TRM", color: "var(--s6)", p: recorte("trm") }],
        yFmt: (v) => num(v, 0),
        vFmt: (v) => `$ ${num(v, 0)}`,
      });
    }
  }

  $("#h-series", el).addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-serie]");
    if (!boton) return;
    const { series } = almacen.obtener().historia;
    const id = boton.dataset.serie;
    // Siempre queda al menos una serie a la vista.
    if (series.includes(id) && series.length === 1) return;
    cambiar({ series: series.includes(id) ? series.filter((s) => s !== id) : [...series, id] });
  });
  $("#h-rango", el).addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-anios]");
    if (boton) cambiar({ anios: Number(boton.dataset.anios) });
  });

  pintar();
  limpieza.agregar(almacen.suscribir((estado) => estado.historia, pintar));
  return { desmontar: limpieza.ejecutar, redibujar: pintar };
}
