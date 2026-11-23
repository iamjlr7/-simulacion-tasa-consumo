/* Vista «Resumen»: la respuesta corta y los indicadores del momento. */

import { promedioSistema, ultimo } from "../dominio/mercado.js";
import { sendaPrediccion } from "../dominio/modelo.js";
import { chispa } from "../graficos/chispa.js";
import { grafico } from "../graficos/lineas.js";
import { D, FECHAS, N, ORIGEN, P, PRINCIPAL, Y0, prediccion } from "../nucleo/datos.js";
import { $, $$, crearLimpieza } from "../nucleo/dom.js";
import { clase, diaCorto, esc, flecha, mesAnio, mesCorto, ms, num, pct, pp, signo } from "../nucleo/formato.js";
import { icono } from "../nucleo/iconos.js";

const PLANTILLA = `
  <section class="heroe tarjeta">
    <div class="heroe-texto">
      <p class="sobre">Crédito de consumo · Colombia</p>
      <h2 class="titular" id="titular"></h2>
      <p class="bajada" id="bajada"></p>
      <div class="pasos" id="pasos"></div>
      <p class="seguimiento" id="seguimiento"></p>
      <div class="acciones">
        <a class="boton primario" href="#/simulador">Abrir el simulador ${icono("flecha", 16)}</a>
        <a class="boton" href="#/credito">Calcular mi cuota</a>
      </div>
    </div>
    <figure class="heroe-grafico">
      <figcaption>
        <strong id="heroe-titulo"></strong>
        <span id="heroe-sub"></span>
      </figcaption>
      <div class="grafico" id="g-heroe"></div>
    </figure>
  </section>

  <section>
    <header class="encabezado">
      <h2>Indicadores en tiempo real</h2>
      <p>Se consultan a las fuentes oficiales al abrir la página y cada cinco minutos.</p>
    </header>
    <div class="fichas" id="fichas"></div>
  </section>

  <section class="accesos">
    <a class="tarjeta acceso" href="#/simulador">${icono("simulador", 22)}<strong>Simulador</strong><span>Mueve la tasa de política, el dinero o la inflación y mira cómo cambia el futuro.</span></a>
    <a class="tarjeta acceso" href="#/mercado">${icono("mercado", 22)}<strong>Mercado en vivo</strong><span>Qué tasa cobró cada banco por libre inversión en la semana más reciente.</span></a>
    <a class="tarjeta acceso" href="#/confianza">${icono("confianza", 22)}<strong>Confiabilidad</strong><span>Cuánto se ha equivocado el modelo cuando se puso a prueba con el pasado.</span></a>
  </section>`;

function ficha({ nombre, valor, detalle, estado, etiqueta, tendencia }) {
  const sello = estado === "vivo"
    ? '<span class="sello vivo-si"><i></i>En vivo</span>'
    : estado === "cargando"
      ? '<span class="sello cargando"><i></i>Consultando</span>'
      : `<span class="sello"><i></i>${etiqueta || "Guardado"}</span>`;
  return `<article class="ficha">
    <div class="ficha-cab"><span class="ficha-nombre">${nombre}</span>${sello}</div>
    <strong>${valor}</strong>
    <div class="ficha-pie"><small>${detalle}</small>${tendencia ? chispa(tendencia) : ""}</div>
  </article>`;
}

export function montar(el, { almacen }) {
  const limpieza = crearLimpieza();
  el.innerHTML = PLANTILLA;

  function pintarTitular(tipo) {
    const elegida = prediccion(tipo);
    const senda = sendaPrediccion(PRINCIPAL, tipo);
    const doce = senda[11];
    const cambio = doce - Y0;
    const verbo = cambio > 0.05 ? "subiría a" : cambio < -0.05 ? "bajaría a" : "seguiría cerca de";
    $("#titular", el).innerHTML = `La tasa está en <em>${pct(Y0)}</em> y en un año ${verbo} <em>${pct(doce)}</em>`;
    $("#bajada", el).innerHTML =
      `Es la tasa promedio que cobran las entidades por un crédito de consumo, efectiva anual, a ${mesAnio(ORIGEN)}. ` +
      `<b>Predicción ${esc(elegida.nombre.toLowerCase())} para ${mesAnio(FECHAS[11])}:</b> ${esc(elegida.resumen)} ${esc(elegida.detalle)}`;
    $("#pasos", el).innerHTML = [1, 3, 6, 12].map((h) => {
      const v = senda[h - 1];
      const d = v - Y0;
      return `<div class="paso"><span>En ${h} ${h === 1 ? "mes" : "meses"}</span><strong>${pct(v)}</strong><small class="${clase(d)}">${flecha(d)} ${pp(d)}</small></div>`;
    }).join("");
    if (D.parcial?.tasa) {
      const previsto = sendaPrediccion(PRINCIPAL, "conservadora")[0];
      const baja = sendaPrediccion(PRINCIPAL, "optimista")[0];
      const alta = sendaPrediccion(PRINCIPAL, "pesimista")[0];
      const dentro = D.parcial.tasa >= baja && D.parcial.tasa <= alta;
      $("#seguimiento", el).innerHTML =
        `<b>Seguimiento:</b> para ${mesAnio(FECHAS[0])} la predicción conservadora fue ${pct(previsto)} ` +
        `(optimista ${pct(baja)}, pesimista ${pct(alta)}). Con ${D.parcial.n} semanas publicadas el promedio va en ` +
        `${pct(D.parcial.tasa)}, ${dentro ? "dentro" : "fuera"} de ese rango.`;
    }
  }

  function pintarGrafico(tipo) {
    const elegida = prediccion(tipo);
    const nombre = `predicción ${elegida.nombre.toLowerCase()}`;
    const desde = N - 61;
    const historia = P.fecha.slice(desde).map((f, i) => [ms(f), P.y[desde + i]]);
    const senda = sendaPrediccion(PRINCIPAL, tipo);
    const t0 = ms(ORIGEN);
    const linea = [[t0, Y0], ...FECHAS.map((f, i) => [ms(f), senda[i]])];
    // El eje no cambia al pasar de una predicción a otra: así se ve que la
    // línea sube o baja, no que el gráfico se reacomoda.
    const extremos = [...historia.map((p) => p[1]), ...sendaPrediccion(PRINCIPAL, "optimista"), ...sendaPrediccion(PRINCIPAL, "pesimista")];
    grafico($("#g-heroe", el), {
      titulo: `Tasa de consumo observada y ${nombre}`,
      alto: 300,
      margenDer: 16,
      yMin: Math.min(...extremos),
      yMax: Math.max(...extremos),
      series: [
        { nombre: "Observada", color: "var(--s1)", p: historia, ancho: 2.2 },
        { nombre: `P${nombre.slice(1)}`, color: "var(--s1)", p: linea, guion: "5 4", ancho: 2.4 },
      ],
      marcas: [{ t: ms(FECHAS[11]), v: senda[11], color: "var(--s1)" }],
      lineasV: [{ t: t0, texto: "Hoy", ancla: "end" }],
      etiquetas: [{ t: ms(FECHAS[11]), v: senda[11], texto: pct(senda[11], 1), dy: -12 }],
    });
    $("#heroe-titulo", el).textContent = `Tasa observada y ${nombre}`;
    $("#heroe-sub", el).textContent = `Efectiva anual, promedio del mes. La línea punteada es una sola predicción: la ${elegida.nombre.toLowerCase()}.`;
  }

  let previas = [];
  function pintarFichas(vivo) {
    const trm = ultimo(vivo.trm.serie);
    const trmAyer = vivo.trm.serie[vivo.trm.serie.length - 2];
    const dTRM = trm && trmAyer ? trm[1] - trmAyer[1] : 0;
    const fed = ultimo(vivo.fed.serie);
    const sistema = vivo.bancos.entidades.length ? promedioSistema(vivo.bancos.entidades) : null;
    const destino = $("#fichas", el);
    destino.innerHTML = [
      ficha({
        nombre: "Tasa de política",
        valor: pct(D.politica.valor),
        detalle: `Banco de la República · desde el ${diaCorto(D.politica.desde)}${D.politica.anterior !== null ? ` (antes ${pct(D.politica.anterior)})` : ""}`,
        estado: "guardado",
        etiqueta: diaCorto(D.politica.fecha),
        tendencia: P.pol.slice(-36),
      }),
      ficha({
        nombre: "Tope legal (usura)",
        valor: vivo.usura.usura ? pct(vivo.usura.usura) : "—",
        detalle: vivo.usura.usura ? `Máximo para consumo hasta el ${diaCorto(vivo.usura.hasta)}` : "Sin dato",
        estado: vivo.usura.estado,
        tendencia: P.usura?.slice(-36),
      }),
      ficha({
        nombre: "Libre inversión",
        valor: sistema ? pct(sistema.tasa) : "—",
        detalle: sistema ? `Semana al ${diaCorto(vivo.bancos.corte)} · ${vivo.bancos.entidades.length} entidades` : "Sin dato",
        estado: vivo.bancos.estado,
        tendencia: D.mercado.semanal?.tasa,
      }),
      ficha({
        nombre: "Dólar (TRM)",
        valor: trm ? `$ ${num(trm[1], 2)}` : "—",
        detalle: trm ? `${diaCorto(trm[0])} · <span class="${clase(dTRM)}">${flecha(dTRM)} ${signo(dTRM)}${num(Math.abs(dTRM), 2)}</span>` : "Sin dato",
        estado: vivo.trm.estado,
        tendencia: vivo.trm.serie.slice(-120).map((p) => p[1]),
      }),
      ficha({
        nombre: "Tasa de la Fed",
        valor: fed ? pct(fed[1]) : "—",
        detalle: fed ? `Fondos federales · ${diaCorto(fed[0])}` : "Sin dato",
        estado: vivo.fed.estado,
        tendencia: vivo.fed.serie.slice(-250).map((p) => p[1]),
      }),
      ficha({
        nombre: "Inflación anual",
        valor: pct(P.inflacion[N - 1]),
        detalle: `${mesAnio(ORIGEN)} · meta: ${pct(P.meta[N - 1], 0)}`,
        estado: "guardado",
        etiqueta: mesCorto(ORIGEN),
        tendencia: P.inflacion.slice(-36),
      }),
    ].join("");
    // Un destello marca la ficha cuyo valor acaba de cambiar.
    const valores = $$(".ficha strong", destino).map((nodo) => nodo.textContent);
    $$(".ficha", destino).forEach((nodo, i) => {
      if (previas.length && previas[i] !== valores[i]) nodo.classList.add("destello");
    });
    previas = valores;
  }

  const pintar = () => {
    const { tipo, vivo } = almacen.obtener();
    pintarTitular(tipo);
    pintarGrafico(tipo);
    pintarFichas(vivo);
  };
  pintar();
  limpieza.agregar(almacen.suscribir((estado) => estado.tipo, (tipo) => { pintarTitular(tipo); pintarGrafico(tipo); }));
  limpieza.agregar(almacen.suscribir((estado) => estado.vivo, pintarFichas));

  return { desmontar: limpieza.ejecutar, redibujar: () => pintarGrafico(almacen.obtener().tipo) };
}
