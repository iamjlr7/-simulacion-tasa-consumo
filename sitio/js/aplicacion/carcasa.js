/* Carcasa: lo que rodea a todas las vistas.
   Menú lateral, barra superior con el selector de predicción, el estado de las
   fuentes en vivo, la descarga en Excel y el tema. */

import { construirConsulta } from "../dominio/consulta.js";
import { D, ORIGEN, PREDICCIONES, prediccion } from "../nucleo/datos.js";
import { $, $$, avisar, guardarPreferencia } from "../nucleo/dom.js";
import { diaCorto, esc, mesAnio } from "../nucleo/formato.js";
import { icono } from "../nucleo/iconos.js";
import { descargar } from "../servicios/excel.js";
import { estadoGeneral } from "../servicios/fuentes.js";
import { RUTAS } from "./rutas.js";

const ICONO_PREDICCION = { optimista: "▼", conservadora: "●", pesimista: "▲" };

export function montarCarcasa(almacen) {
  /* ---------- Menú ---------- */
  $("#nav").innerHTML = RUTAS.map((ruta) =>
    `<a href="#/${ruta.id}" data-ruta="${ruta.id}">${icono(ruta.icono)}<span>${esc(ruta.titulo)}</span></a>`).join("");

  /* ---------- Selector de predicción ---------- */
  const selector = $("#selector");
  selector.innerHTML = PREDICCIONES.map((p) =>
    `<button type="button" class="pred-${p.id}" data-tipo="${p.id}" title="${esc(p.resumen)}"><i aria-hidden="true">${ICONO_PREDICCION[p.id] ?? ""}</i>${esc(p.nombre)}</button>`).join("");
  const pintarSelector = (tipo) => {
    $$("[data-tipo]", selector).forEach((boton) => boton.setAttribute("aria-pressed", String(boton.dataset.tipo === tipo)));
  };
  selector.addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-tipo]");
    if (!boton || boton.dataset.tipo === almacen.obtener().tipo) return;
    almacen.actualizar({ tipo: boton.dataset.tipo });
    guardarPreferencia("prediccion", boton.dataset.tipo);
  });
  pintarSelector(almacen.obtener().tipo);
  almacen.suscribir((estado) => estado.tipo, pintarSelector);

  /* ---------- Descarga en Excel ---------- */
  $("#excel").innerHTML = `${icono("descargar", 16)}<span>Descargar Excel</span>`;
  $("#excel").addEventListener("click", () => {
    try {
      const estado = almacen.obtener();
      const nombre = descargar(construirConsulta(estado));
      avisar(`Se descargó ${nombre} con la predicción ${prediccion(estado.tipo).nombre.toLowerCase()}`, "exito");
    } catch (error) {
      console.error(error);
      avisar("No se pudo generar el Excel", "error");
    }
  });

  /* ---------- Tema claro u oscuro ---------- */
  const raiz = document.documentElement;
  const esOscuro = () => (raiz.dataset.theme ? raiz.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  const pintarTema = () => { $("#tema").innerHTML = icono(esOscuro() ? "sol" : "luna", 18); };
  $("#tema").addEventListener("click", () => {
    raiz.dataset.theme = esOscuro() ? "light" : "dark";
    guardarPreferencia("tema", raiz.dataset.theme);
    pintarTema();
  });
  pintarTema();

  /* ---------- Estado de las fuentes en vivo ---------- */
  const chip = $("#chip-vivo");
  const pintarVivo = (vivo) => {
    const { estado, texto } = estadoGeneral(vivo);
    chip.dataset.estado = estado;
    $("span", chip).textContent = texto;
  };
  pintarVivo(almacen.obtener().vivo);
  almacen.suscribir((estado) => estado.vivo, pintarVivo);

  const reloj = $("#reloj");
  setInterval(() => {
    const { ultima, proxima } = almacen.obtener().vivo;
    if (!ultima) return;
    const hora = new Date(ultima).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    const faltan = Math.max(0, Math.round((proxima - Date.now()) / 1000));
    reloj.textContent = `Última consulta ${hora} · próxima en ${Math.floor(faltan / 60)}:${String(faltan % 60).padStart(2, "0")}`;
  }, 1000);

  /* ---------- Pie ---------- */
  $("#pie-datos").textContent =
    `Modelo estimado con ${D.meta.meses} meses, de ${mesAnio(D.meta.inicio)} a ${mesAnio(ORIGEN)}. ` +
    `Datos generados el ${diaCorto(D.meta.generado.slice(0, 10))}.`;
  $("#derechos").textContent = D.meta.derechos;

  // El enrutador avisa aquí cada vez que cambia la vista.
  return {
    marcarRuta(ruta) {
      $$("#nav a").forEach((enlace) => {
        const activa = enlace.dataset.ruta === ruta.id;
        enlace.classList.toggle("activo", activa);
        if (activa) enlace.setAttribute("aria-current", "page"); else enlace.removeAttribute("aria-current");
      });
      $("#vista-titulo").textContent = ruta.titulo;
      $("#vista-bajada").textContent = ruta.bajada;
      document.title = `${ruta.titulo} · ${D.meta.nombre}`;
    },
  };
}
