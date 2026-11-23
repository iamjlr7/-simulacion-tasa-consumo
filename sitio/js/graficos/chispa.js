/* Minigráfico de tendencia para las fichas: una línea sin ejes. */

// Devuelve el SVG como texto. `valores` es una lista de números; los vacíos
// se saltan. El último punto lleva una marca.
export function chispa(valores, { ancho = 96, alto = 30 } = {}) {
  const datos = valores.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (datos.length < 2) return "";
  const minimo = Math.min(...datos);
  const maximo = Math.max(...datos);
  const margen = 3;
  const sx = (i) => margen + (i / (datos.length - 1)) * (ancho - 2 * margen);
  const sy = (v) => margen + (1 - (v - minimo) / (maximo - minimo || 1)) * (alto - 2 * margen);
  const d = datos.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
  const fin = datos.length - 1;
  return `<svg class="chispa" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="var(--chispa)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${sx(fin).toFixed(1)}" cy="${sy(datos[fin]).toFixed(1)}" r="2.6" fill="var(--chispa)"/>
  </svg>`;
}
