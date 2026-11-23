/* Cuentas sobre las tasas que reporta cada entidad. */

// Tasa del sistema: promedio de las entidades ponderado por monto desembolsado.
export function promedioSistema(entidades) {
  const monto = entidades.reduce((suma, e) => suma + e.monto, 0);
  return {
    tasa: entidades.reduce((suma, e) => suma + e.tasa * e.monto, 0) / monto,
    monto,
    creditos: entidades.reduce((suma, e) => suma + e.creditos, 0),
  };
}

export const ultimo = (serie) => serie[serie.length - 1];

// Las entidades que se muestran: las que más prestaron o, entre las que
// hicieron al menos 50 créditos, las de menor tasa.
export function ordenarEntidades(entidades, orden, cuantas = 14) {
  const lista = orden === "tasa"
    ? entidades.filter((e) => e.creditos >= 50).sort((a, b) => a.tasa - b.tasa)
    : entidades.slice().sort((a, b) => b.monto - a.monto);
  return lista.slice(0, cuantas);
}
