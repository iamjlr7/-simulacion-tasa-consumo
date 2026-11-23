/* Utilidades de interfaz compartidas: selección, tooltip, avisos y preferencias. */

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

export const MOVIMIENTO_REDUCIDO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Tooltip ---------- */

const tip = () => $("#tip");

export function mostrarTip(html, x, y) {
  const caja = tip();
  if (!caja) return;
  caja.innerHTML = html;
  caja.classList.add("visible");
  const ancho = caja.offsetWidth;
  const alto = caja.offsetHeight;
  let izquierda = x + 14;
  let arriba = y + 14;
  if (izquierda + ancho > window.innerWidth - 8) izquierda = x - ancho - 14;
  if (arriba + alto > window.innerHeight - 8) arriba = y - alto - 14;
  caja.style.left = `${Math.max(8, izquierda)}px`;
  caja.style.top = `${Math.max(8, arriba)}px`;
}

export function ocultarTip() {
  tip()?.classList.remove("visible");
}

// Cualquier elemento con `data-tip` muestra su contenido al pasar el cursor.
export function activarTips() {
  document.addEventListener("pointermove", (evento) => {
    const fuente = evento.target.closest?.("[data-tip]");
    if (fuente) mostrarTip(fuente.dataset.tip, evento.clientX, evento.clientY);
    else if (!evento.target.closest?.(".grafico svg")) ocultarTip();
  });
  document.addEventListener("scroll", ocultarTip, { passive: true });
}

/* ---------- Avisos breves ---------- */

export function avisar(texto, tipo = "info") {
  const zona = $("#avisos");
  if (!zona) return;
  const aviso = document.createElement("div");
  aviso.className = `aviso aviso-${tipo}`;
  aviso.textContent = texto;
  zona.appendChild(aviso);
  setTimeout(() => {
    aviso.classList.add("saliendo");
    setTimeout(() => aviso.remove(), 300);
  }, 3200);
}

/* ---------- Preferencias guardadas en el navegador ---------- */

// El almacenamiento puede no existir (ventana privada, permisos): nunca debe
// romper la página, así que cada acceso va protegido.
export function leerPreferencia(clave, porDefecto = null) {
  try {
    const valor = localStorage.getItem(`tasaviva-${clave}`);
    return valor === null ? porDefecto : valor;
  } catch (error) {
    return porDefecto;
  }
}

export function guardarPreferencia(clave, valor) {
  try {
    localStorage.setItem(`tasaviva-${clave}`, valor);
  } catch (error) {
    /* sin almacenamiento */
  }
}

/* ---------- Limpieza de una vista ---------- */

// Cada vista junta aquí lo que hay que deshacer al salir de ella
// (suscripciones, temporizadores, animaciones).
export function crearLimpieza() {
  const tareas = [];
  return {
    agregar: (tarea) => { tareas.push(tarea); return tarea; },
    ejecutar: () => { tareas.splice(0).forEach((tarea) => tarea()); },
  };
}
