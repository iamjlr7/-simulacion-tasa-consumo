/* Iconos de línea, dibujados a mano en una rejilla de 24 × 24. */

const TRAZOS = {
  resumen: '<rect x="3" y="3" width="8" height="10" rx="2"/><rect x="13" y="3" width="8" height="6" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/><rect x="3" y="15" width="8" height="6" rx="2"/>',
  simulador: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  credito: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
  mercado: '<path d="M3 21h18M4 10h16M12 3l8 5H4l8-5zM6.5 10v8M10.2 10v8M13.8 10v8M17.5 10v8"/>',
  historia: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  confianza: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  metodo: '<path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3V4z"/><path d="M5 17a3 3 0 013-3h10"/>',
  descargar: '<path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14"/>',
  luna: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  flecha: '<path d="M5 12h14m0 0l-6-6m6 6l-6 6"/>',
  reproducir: '<path d="M7 5l12 7-12 7V5z"/>',
  pausa: '<path d="M8 5v14M16 5v14"/>',
  reiniciar: '<path d="M4 4v6h6"/><path d="M4.6 14a8 8 0 102-8.6L4 10"/>',
  capas: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
};

export function icono(nombre, tamano = 20) {
  return `<svg class="icono-svg" viewBox="0 0 24 24" width="${tamano}" height="${tamano}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAZOS[nombre] ?? ""}</svg>`;
}
