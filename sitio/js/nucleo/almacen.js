/* Almacén de estado.
   Hay una sola fuente de verdad para lo que la persona eligió (predicción,
   modelo, plazo, crédito) y para lo que llegó en vivo. Las vistas no se hablan
   entre sí: cambian el almacén y se enteran de los cambios por suscripción.
   El flujo va siempre en una dirección: acción → almacén → vistas. */

function iguales(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((valor, i) => Object.is(valor, b[i]));
  }
  return false;
}

export function crearAlmacen(inicial) {
  let estado = inicial;
  const oyentes = new Set();

  const obtener = () => estado;

  // `cambio` es un objeto parcial o una función que lo calcula del estado actual.
  // El estado nunca se modifica en sitio: cada cambio produce un objeto nuevo.
  function actualizar(cambio) {
    const parcial = typeof cambio === "function" ? cambio(estado) : cambio;
    if (!parcial) return;
    estado = { ...estado, ...parcial };
    [...oyentes].forEach((oyente) => oyente(estado));
  }

  // `selector` elige la parte del estado que le importa a quien se suscribe
  // (un valor o una lista de valores). `alCambiar` solo se llama si esa parte
  // cambió, así cada vista se redibuja únicamente cuando le toca.
  function suscribir(selector, alCambiar) {
    let previo = selector(estado);
    const oyente = (nuevo) => {
      const actual = selector(nuevo);
      if (iguales(actual, previo)) return;
      const anterior = previo;
      previo = actual;
      alCambiar(actual, anterior);
    };
    oyentes.add(oyente);
    return () => oyentes.delete(oyente);
  }

  return { obtener, actualizar, suscribir };
}
