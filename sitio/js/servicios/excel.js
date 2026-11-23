/* Descarga en Excel.
   Genera un .xlsx de verdad sin librerías: un .xlsx es un ZIP con varios XML.
   Aquí el ZIP va sin comprimir (método "stored"), que Excel abre igual y evita
   depender de un compresor. El archivo pesa unos pocos KB.

   `construirHojas` y `crearLibro` son funciones puras, sin tocar la pantalla,
   para poder probarlas fuera del navegador. `descargar` es la única que usa
   el navegador. */

/* ------------------------------------------------------------------ */
/* Estilos                                                             */
/* ------------------------------------------------------------------ */

// El orden es el índice de cada estilo en styles.xml (cellXfs).
const ESTILOS = [
  "general", "cabecera", "num", "tasa", "pesos", "entero", "fecha", "titulo",
  "nota", "rotulo", "fechahora", "pp", "porc", "mes", "trm", "seccion", "margen",
];
const INDICE = Object.fromEntries(ESTILOS.map((nombre, i) => [nombre, i]));
const SON_FECHA = new Set(["fecha", "fechahora", "mes"]);

const XML_ESTILOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="8">' +
  '<numFmt numFmtId="164" formatCode="0.00&quot; %&quot;"/>' +
  '<numFmt numFmtId="165" formatCode="&quot;$&quot; #,##0"/>' +
  '<numFmt numFmtId="166" formatCode="dd/mm/yyyy"/>' +
  '<numFmt numFmtId="167" formatCode="dd/mm/yyyy hh:mm"/>' +
  '<numFmt numFmtId="168" formatCode="+0.00&quot; pp&quot;;-0.00&quot; pp&quot;;0.00&quot; pp&quot;"/>' +
  '<numFmt numFmtId="169" formatCode="mmm yyyy"/>' +
  '<numFmt numFmtId="170" formatCode="&quot;$&quot; #,##0.00"/>' +
  '<numFmt numFmtId="171" formatCode="&quot;±&quot;0.00&quot; pp&quot;"/>' +
  "</numFmts>" +
  '<fonts count="4">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="15"/><color rgb="FF173A7A"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><i/><sz val="10"/><color rgb="FF5B6472"/><name val="Calibri"/><family val="2"/></font>' +
  "</fonts>" +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEFB"/><bgColor indexed="64"/></patternFill></fill>' +
  "</fills>" +
  '<borders count="2">' +
  "<border><left/><right/><top/><bottom/><diagonal/></border>" +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF9AA3B2"/></bottom><diagonal/></border>' +
  "</borders>" +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  `<cellXfs count="${ESTILOS.length}">` +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // general
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // cabecera
  '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // num
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // tasa
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // pesos
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // entero
  '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>' + // fecha
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // titulo
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // nota
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // rotulo
  '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>' + // fechahora
  '<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // pp
  '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // porc
  '<xf numFmtId="169" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>' + // mes
  '<xf numFmtId="170" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // trm
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>' + // seccion
  '<xf numFmtId="171" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // margen
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

/* ------------------------------------------------------------------ */
/* XML de las hojas                                                    */
/* ------------------------------------------------------------------ */

const escapar = (texto) => String(texto)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function letraColumna(indice) {
  let n = indice + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

// Excel cuenta los días desde el 30 de diciembre de 1899.
function serieFecha(iso) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(iso));
  if (!partes) return null;
  const dias = (Date.UTC(+partes[1], +partes[2] - 1, +partes[3]) - Date.UTC(1899, 11, 30)) / 86400000;
  const fraccion = partes[4] ? (+partes[4] * 60 + +partes[5]) / 1440 : 0;
  return dias + fraccion;
}

function xmlCelda(celda, fila, columna) {
  if (celda === null || celda === undefined) return "";
  const objeto = typeof celda === "object" ? celda : { v: celda };
  let valor = objeto.v;
  if (valor === null || valor === undefined || valor === "") return "";
  const estilo = INDICE[objeto.f] ?? 0;
  const referencia = `${letraColumna(columna)}${fila}`;
  const s = estilo ? ` s="${estilo}"` : "";
  if (SON_FECHA.has(objeto.f) && typeof valor === "string") {
    const serie = serieFecha(valor);
    if (serie !== null) valor = serie;
  }
  if (typeof valor === "boolean") valor = valor ? "Sí" : "No";
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    return `<c r="${referencia}"${s}><v>${Number(valor.toFixed(10))}</v></c>`;
  }
  return `<c r="${referencia}"${s} t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
}

function xmlHoja(hoja) {
  const filas = hoja.filas || [];
  const columnas = Math.max(1, ...filas.map((fila) => fila.length));
  let xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${letraColumna(columnas - 1)}${Math.max(1, filas.length)}"/>` +
    '<sheetViews><sheetView workbookViewId="0">';
  if (hoja.congelar) {
    xml += `<pane ySplit="${hoja.congelar}" topLeftCell="A${hoja.congelar + 1}" activePane="bottomLeft" state="frozen"/>`;
  }
  xml += "</sheetView></sheetViews>";
  if (hoja.anchos && hoja.anchos.length) {
    xml += "<cols>" + hoja.anchos.map((ancho, i) => `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`).join("") + "</cols>";
  }
  xml += "<sheetData>";
  filas.forEach((fila, i) => {
    const celdas = fila.map((celda, j) => xmlCelda(celda, i + 1, j)).join("");
    if (celdas) xml += `<row r="${i + 1}">${celdas}</row>`;
  });
  return xml + "</sheetData></worksheet>";
}

// Excel no acepta estos caracteres en el nombre de una hoja, ni más de 31.
const nombreHoja = (nombre) => String(nombre).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31) || "Hoja";

/* ------------------------------------------------------------------ */
/* ZIP sin comprimir                                                   */
/* ------------------------------------------------------------------ */

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function empaquetar(archivos, momento) {
  const codificador = new TextEncoder();
  const fecha = momento || new Date();
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1);
  const dia = ((Math.max(1980, fecha.getFullYear()) - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  const entradas = archivos.map((archivo) => {
    const nombre = codificador.encode(archivo.nombre);
    const datos = codificador.encode(archivo.texto);
    return { nombre, datos, crc: crc32(datos) };
  });
  const tamanoLocal = entradas.reduce((suma, e) => suma + 30 + e.nombre.length + e.datos.length, 0);
  const tamanoCentral = entradas.reduce((suma, e) => suma + 46 + e.nombre.length, 0);
  const salida = new Uint8Array(tamanoLocal + tamanoCentral + 22);
  const vista = new DataView(salida.buffer);
  let posicion = 0;
  const desplazamientos = [];
  entradas.forEach((e) => {
    desplazamientos.push(posicion);
    vista.setUint32(posicion, 0x04034B50, true);
    vista.setUint16(posicion + 4, 20, true); // versión mínima
    vista.setUint16(posicion + 6, 0x0800, true); // nombres en UTF-8
    vista.setUint16(posicion + 8, 0, true); // sin compresión
    vista.setUint16(posicion + 10, hora, true);
    vista.setUint16(posicion + 12, dia, true);
    vista.setUint32(posicion + 14, e.crc, true);
    vista.setUint32(posicion + 18, e.datos.length, true);
    vista.setUint32(posicion + 22, e.datos.length, true);
    vista.setUint16(posicion + 26, e.nombre.length, true);
    vista.setUint16(posicion + 28, 0, true);
    salida.set(e.nombre, posicion + 30);
    salida.set(e.datos, posicion + 30 + e.nombre.length);
    posicion += 30 + e.nombre.length + e.datos.length;
  });
  const inicioCentral = posicion;
  entradas.forEach((e, i) => {
    vista.setUint32(posicion, 0x02014B50, true);
    vista.setUint16(posicion + 4, 20, true);
    vista.setUint16(posicion + 6, 20, true);
    vista.setUint16(posicion + 8, 0x0800, true);
    vista.setUint16(posicion + 10, 0, true);
    vista.setUint16(posicion + 12, hora, true);
    vista.setUint16(posicion + 14, dia, true);
    vista.setUint32(posicion + 16, e.crc, true);
    vista.setUint32(posicion + 20, e.datos.length, true);
    vista.setUint32(posicion + 24, e.datos.length, true);
    vista.setUint16(posicion + 28, e.nombre.length, true);
    vista.setUint32(posicion + 42, desplazamientos[i], true);
    salida.set(e.nombre, posicion + 46);
    posicion += 46 + e.nombre.length;
  });
  vista.setUint32(posicion, 0x06054B50, true);
  vista.setUint16(posicion + 8, entradas.length, true);
  vista.setUint16(posicion + 10, entradas.length, true);
  vista.setUint32(posicion + 12, posicion - inicioCentral, true);
  vista.setUint32(posicion + 16, inicioCentral, true);
  return salida;
}

/* ------------------------------------------------------------------ */
/* Libro                                                               */
/* ------------------------------------------------------------------ */

export function crearLibro(hojas, opciones = {}) {
  if (!hojas || !hojas.length) throw new Error("El libro necesita al menos una hoja.");
  const cabecera = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const creado = (opciones.momento || new Date()).toISOString().slice(0, 19) + "Z";
  const tipos =
    cabecera +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    "</Types>";
  const relaciones =
    cabecera +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    "</Relationships>";
  const propiedades =
    cabecera +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapar(opciones.titulo || "TasaViva")}</dc:title>` +
    `<dc:creator>${escapar(opciones.autor || "TasaViva")}</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${creado}</dcterms:created>` +
    "</cp:coreProperties>";
  const libro =
    cabecera +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>' +
    "<sheets>" +
    hojas.map((hoja, i) => `<sheet name="${escapar(nombreHoja(hoja.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    "</sheets></workbook>";
  const relacionesLibro =
    cabecera +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";
  return empaquetar([
    { nombre: "[Content_Types].xml", texto: tipos },
    { nombre: "_rels/.rels", texto: relaciones },
    { nombre: "docProps/core.xml", texto: propiedades },
    { nombre: "xl/workbook.xml", texto: libro },
    { nombre: "xl/_rels/workbook.xml.rels", texto: relacionesLibro },
    { nombre: "xl/styles.xml", texto: XML_ESTILOS },
    ...hojas.map((hoja, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: xmlHoja(hoja) })),
  ], opciones.momento);
}

/* ------------------------------------------------------------------ */
/* Las cuatro hojas de una consulta                                    */
/* ------------------------------------------------------------------ */

const c = (v, f) => ({ v, f });
const meses = (n) => `${n} ${n === 1 ? "mes" : "meses"}`;

function hojaResumen(q) {
  const r = q.resultado;
  const k = q.condiciones;
  const real = (usado, original) => (Math.abs(usado - original) < 1e-9 ? "Valor real" : "Cambiado por ti");
  const filas = [
    [c(`${q.proyecto.nombre} · tu consulta`, "titulo")],
    [c(q.proyecto.lema, "nota")],
    [],
    [c("Consulta", "seccion"), c("", "seccion")],
    [c("Fecha y hora", "rotulo"), c(q.generado, "fechahora")],
    [c("Predicción elegida", "rotulo"), q.prediccion.nombre],
    [c("Qué supone", "rotulo"), `${q.prediccion.resumen} ${q.prediccion.detalle}`],
    [c("Modelo", "rotulo"), q.modelo.nombre],
    [c("Plazo", "rotulo"), meses(q.plazo.meses)],
    [c("Mes de la predicción", "rotulo"), c(q.plazo.fecha, "mes")],
    [],
    [c("Resultado", "seccion"), c("", "seccion")],
    [c("Tasa de hoy, efectiva anual", "rotulo"), c(q.origen.tasa, "tasa"), c(q.origen.fecha, "mes")],
    [c(`Tasa con la predicción ${q.prediccion.nombre.toLowerCase()}`, "rotulo"), c(r.tasa, "tasa")],
    [c("Cambio frente a hoy", "rotulo"), c(r.cambio, "pp")],
    [c("Predicción optimista", "rotulo"), c(r.optimista, "tasa")],
    [c("Predicción conservadora", "rotulo"), c(r.conservadora, "tasa")],
    [c("Predicción pesimista", "rotulo"), c(r.pesimista, "tasa")],
    [c("Probabilidad de que la tasa suba", "rotulo"), c(r.probSube, "porc"), `${r.suben} de ${r.episodios} futuros simulados quedan por encima de hoy`],
    [c("Error típico del modelo a ese plazo", "rotulo"), c(r.rmse, "margen"), "Promedio de lo que se ha equivocado en las pruebas con datos del pasado"],
    [],
    [c("Condiciones de partida", "seccion"), c("", "seccion")],
    [c("Tasa de política", "rotulo"), c(k.politica, "tasa"), real(k.politica, k.politicaReal)],
    [c("Crecimiento anual de M2", "rotulo"), c(k.m2, "tasa"), real(k.m2, k.m2Real)],
    [c("Inflación anual", "rotulo"), c(k.inflacion, "tasa"), real(k.inflacion, k.inflacionReal)],
    [c("¿Cambiaste las condiciones?", "rotulo"), k.activas ? "Sí" : "No"],
    [],
    [c("Para leer este archivo", "seccion"), c("", "seccion")],
    [c(q.proyecto.aviso, "nota")],
    [c("La predicción optimista y la pesimista no son límites: la tasa puede salirse de ese rango.", "nota")],
    [c("Las tasas están en porcentaje efectivo anual. «pp» son puntos porcentuales.", "nota")],
    [c("Fuentes: Banco de la República, Superintendencia Financiera (datos.gov.co) y Reserva Federal de Nueva York.", "nota")],
    [c(q.proyecto.derechos, "nota")],
  ];
  return { nombre: "Resumen", anchos: [38, 22, 62], filas };
}

function hojaProyeccion(q) {
  const elegida = q.prediccion.id;
  const filas = [[
    c("Meses desde hoy", "cabecera"), c("Mes", "cabecera"), c("Optimista", "cabecera"), c("Conservadora", "cabecera"),
    c("Pesimista", "cabecera"), c("Mínimo del rango del 95 %", "cabecera"), c("Máximo del rango del 95 %", "cabecera"),
    c(`Tu predicción (${q.prediccion.nombre.toLowerCase()})`, "cabecera"),
  ]];
  q.senda.forEach((fila) => {
    filas.push([
      c(fila.meses, "entero"), c(fila.fecha, "mes"), c(fila.optimista, "tasa"), c(fila.conservadora, "tasa"),
      c(fila.pesimista, "tasa"), c(fila.min95, "tasa"), c(fila.max95, "tasa"), c(fila[elegida], "tasa"),
    ]);
  });
  return { nombre: "Proyección", anchos: [12, 12, 13, 14, 13, 16, 16, 18], filas, congelar: 1 };
}

function hojaCredito(q) {
  const k = q.credito;
  const filas = [
    [c("Tu crédito", "titulo")],
    [c("Cuota fija mensual calculada con cada tasa. La tasa promedio del mercado no es la que te ofrecerá tu banco.", "nota")],
    [],
  ];
  if (!k || !k.monto) {
    filas.push([c("No había un monto escrito en la calculadora al descargar.", "nota")]);
    return { nombre: "Crédito", anchos: [44, 20, 18, 20, 18, 24], filas };
  }
  filas.push(
    [c("Monto del crédito", "rotulo"), c(k.monto, "pesos")],
    [c("Plazo del crédito", "rotulo"), meses(k.plazo)],
    [c("Cuándo lo pedirías", "rotulo"), `En ${meses(k.cuando.meses)}`, c(k.cuando.fecha, "mes")],
    [c("Modelo usado", "rotulo"), k.modelo],
    [],
    [
      c("Caso", "cabecera"), c("Tasa efectiva anual", "cabecera"), c("Cuota mensual", "cabecera"),
      c("Intereses en todo el crédito", "cabecera"), c("Total pagado", "cabecera"), c("Cuota frente a pedirlo hoy", "cabecera"),
    ],
  );
  k.filas.forEach((fila) => {
    filas.push([
      c(fila.caso, fila.elegida ? "rotulo" : undefined), c(fila.tasa, "tasa"), c(fila.cuota, "pesos"),
      c(fila.intereses, "pesos"), c(fila.total, "pesos"), fila.diferencia === null ? "" : c(fila.diferencia, "pesos"),
    ]);
  });
  return { nombre: "Crédito", anchos: [44, 20, 18, 20, 18, 24], filas };
}

function hojaIndicadores(q) {
  const filas = [[
    c("Indicador", "cabecera"), c("Valor", "cabecera"), c("Unidad", "cabecera"),
    c("Fecha del dato", "cabecera"), c("Fuente", "cabecera"), c("Estado al descargar", "cabecera"),
  ]];
  q.indicadores.forEach((fila) => {
    filas.push([fila.nombre, c(fila.valor, fila.formato || "num"), fila.unidad, c(fila.fecha, "fecha"), fila.fuente, fila.estado]);
  });
  return { nombre: "Indicadores", anchos: [40, 14, 22, 15, 48, 20], filas, congelar: 1 };
}

export function construirHojas(consulta) {
  return [hojaResumen(consulta), hojaProyeccion(consulta), hojaCredito(consulta), hojaIndicadores(consulta)];
}

export function nombreArchivo(consulta) {
  const sello = String(consulta.generado).slice(0, 16).replace("T", "_").replace(":", "");
  return `TasaViva_${consulta.prediccion.id}_${sello}.xlsx`;
}

export const TIPO_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Arma el libro y se lo entrega al navegador como archivo. Nada sale del equipo.
export function descargar(consulta) {
  const bytes = crearLibro(construirHojas(consulta), {
    titulo: `${consulta.proyecto.nombre} · consulta`,
    autor: consulta.proyecto.nombre,
  });
  const nombre = nombreArchivo(consulta);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([bytes], { type: TIPO_MIME }));
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 2000);
  return nombre;
}
