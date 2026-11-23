/* Enrutador por hash (#/resumen, #/simulador…).
   Monta una vista a la vez. Al cambiar de ruta desmonta la anterior, para que
   no queden suscripciones ni animaciones corriendo, y carga la nueva. Si una
   vista falla, el error se queda en su recuadro y el resto de la aplicación
   sigue funcionando. */

import { esc } from "../nucleo/formato.js";
import { rutaDe } from "./rutas.js";

export function crearEnrutador({ contenedor, contexto, alCambiar }) {
  let vista = null;
  let turno = 0;

  function mostrarError(ruta, error) {
    console.error(`No se pudo abrir «${ruta.titulo}»`, error);
    contenedor.innerHTML = `
      <div class="tarjeta error-vista" role="alert">
        <h2>No se pudo abrir «${esc(ruta.titulo)}»</h2>
        <p>${esc(error?.message ?? "Error desconocido")}</p>
        <p class="ayuda">Recarga la página. Si la abriste con doble clic, ábrela desde un servidor local: mira el archivo README.</p>
      </div>`;
  }

  async function ir() {
    const ruta = rutaDe(location.hash);
    const miTurno = ++turno;
    alCambiar(ruta);
    contenedor.setAttribute("aria-busy", "true");
    let modulo;
    try {
      modulo = await ruta.cargar();
    } catch (error) {
      if (miTurno === turno) mostrarError(ruta, error);
      return;
    }
    // Si la persona ya navegó a otra parte mientras cargaba, esta carga se descarta.
    if (miTurno !== turno) return;
    vista?.desmontar?.();
    vista = null;
    contenedor.innerHTML = "";
    contenedor.dataset.vista = ruta.id;
    try {
      vista = modulo.montar(contenedor, contexto) ?? null;
    } catch (error) {
      mostrarError(ruta, error);
    }
    contenedor.removeAttribute("aria-busy");
    contenedor.classList.remove("entrando");
    void contenedor.offsetWidth;
    contenedor.classList.add("entrando");
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", ir);
  return {
    iniciar: ir,
    redibujar: () => vista?.redibujar?.(),
    navegar: (id) => { location.hash = `#/${id}`; },
  };
}
