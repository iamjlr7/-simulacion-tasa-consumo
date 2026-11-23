/* Pruebas de la aplicación web. Corren con Node, sin navegador:

     node --test pruebas/

   Cubren lo que no depende de la pantalla: el almacén, el modelo, las cuentas
   del crédito, el Excel y la lista de archivos del modo sin conexión. */

import "./preparar.js";

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { RUTAS, rutaDe } from "../js/aplicacion/rutas.js";
import { construirConsulta } from "../js/dominio/consulta.js";
import { casosCredito, cuotaMensual } from "../js/dominio/credito.js";
import { ordenarEntidades, promedioSistema } from "../js/dominio/mercado.js";
import {
  CONDICIONES_BASE, condicionesActivas, cuantil, futurosEn, sendaCentral, sendaPrediccion,
} from "../js/dominio/modelo.js";
import { crearAlmacen } from "../js/nucleo/almacen.js";
import { D, HMAX, PREDICCIONES, PRINCIPAL, Y0 } from "../js/nucleo/datos.js";
import { construirHojas, crearLibro, nombreArchivo } from "../js/servicios/excel.js";
import { estadoGeneral, vivoInicial } from "../js/servicios/fuentes.js";
import { RAIZ } from "./preparar.js";

const cerca = (a, b, tolerancia, mensaje) => assert.ok(Math.abs(a - b) <= tolerancia, `${mensaje}: ${a} frente a ${b}`);

const estadoDePrueba = (cambios = {}) => ({
  tipo: "pesimista",
  sim: { modelo: PRINCIPAL, h: 18, condiciones: { ...CONDICIONES_BASE, dPol: -100 }, umbral: 24 },
  credito: { monto: 25_000_000, plazo: 48, cuando: 12 },
  vivo: vivoInicial(),
  ...cambios,
});

/* ---------- Almacén ---------- */

test("el almacén avisa solo a quien le cambió su parte", () => {
  const almacen = crearAlmacen({ tipo: "conservadora", sim: { h: 12 } });
  const vistos = [];
  const dejar = almacen.suscribir((estado) => estado.tipo, (tipo, anterior) => vistos.push([tipo, anterior]));
  almacen.actualizar({ sim: { h: 6 } });
  assert.deepEqual(vistos, [], "cambiar el simulador no avisa a quien mira la predicción");
  almacen.actualizar({ tipo: "pesimista" });
  assert.deepEqual(vistos, [["pesimista", "conservadora"]]);
  almacen.actualizar({ tipo: "pesimista" });
  assert.equal(vistos.length, 1, "el mismo valor no avisa dos veces");
  dejar();
  almacen.actualizar({ tipo: "optimista" });
  assert.equal(vistos.length, 1, "tras darse de baja no recibe más avisos");
  assert.equal(almacen.obtener().tipo, "optimista");
});

test("el almacén compara listas de partes elemento por elemento", () => {
  const almacen = crearAlmacen({ a: 1, b: 2, c: 3 });
  let avisos = 0;
  almacen.suscribir((estado) => [estado.a, estado.b], () => { avisos += 1; });
  almacen.actualizar({ c: 30 });
  assert.equal(avisos, 0);
  almacen.actualizar((estado) => ({ b: estado.b + 1 }));
  assert.equal(avisos, 1);
});

/* ---------- Modelo ---------- */

test("el navegador reproduce la proyección central del estudio", () => {
  for (const modelo of ["ridge_agregados", "ridge_real", "ridge_tasa_politica", "combinado"]) {
    const senda = sendaCentral(modelo);
    assert.equal(senda.length, HMAX);
    senda.forEach((valor, i) => cerca(valor, D.proyeccion[modelo].central[i], 1e-3, `${modelo}, plazo ${i + 1}`));
  }
});

test("optimista y pesimista son los bordes del rango del 80 % publicado", () => {
  const publicada = D.proyeccion[PRINCIPAL];
  sendaPrediccion(PRINCIPAL, "optimista").forEach((valor, i) => cerca(valor, publicada.b80i[i], 2e-3, `optimista, plazo ${i + 1}`));
  sendaPrediccion(PRINCIPAL, "pesimista").forEach((valor, i) => cerca(valor, publicada.b80s[i], 2e-3, `pesimista, plazo ${i + 1}`));
  assert.deepEqual(sendaPrediccion(PRINCIPAL, "conservadora"), sendaCentral(PRINCIPAL));
});

test("las tres predicciones quedan en orden para quien pide el crédito", () => {
  assert.deepEqual(PREDICCIONES.map((p) => p.id), ["optimista", "conservadora", "pesimista"]);
  const [baja, media, alta] = PREDICCIONES.map((p) => sendaPrediccion(PRINCIPAL, p.id));
  for (let i = 0; i < HMAX; i += 1) assert.ok(baja[i] < media[i] && media[i] < alta[i], `plazo ${i + 1}`);
});

test("cambiar las condiciones mueve la proyección; las reales no cuentan como cambio", () => {
  assert.equal(condicionesActivas(PRINCIPAL, CONDICIONES_BASE), false);
  const conMenosPolitica = { ...CONDICIONES_BASE, dPol: -100 };
  assert.equal(condicionesActivas(PRINCIPAL, conMenosPolitica), true);
  assert.ok(sendaCentral(PRINCIPAL, conMenosPolitica)[11] < sendaCentral(PRINCIPAL)[11], "bajar la política baja la tasa proyectada a 12 meses");
  assert.equal(condicionesActivas("sarimax", conMenosPolitica), false, "un modelo que no se recalcula ignora las condiciones");
});

test("los futuros de un plazo salen de los errores conocidos", () => {
  const doce = futurosEn(PRINCIPAL, 12);
  const veinticuatro = futurosEn(PRINCIPAL, 24);
  assert.ok(doce.length > veinticuatro.length, "a plazos largos hay menos episodios con resultado");
  assert.ok(veinticuatro.length >= 100);
  assert.equal(cuantil([1, 2, 3, 4], 0.5), 2.5);
});

/* ---------- Crédito y mercado ---------- */

test("la cuota usa la tasa mensual equivalente", () => {
  cerca(cuotaMensual(10_000_000, 21.25, 36), 368_707, 1, "cuota de 10 millones a 36 meses");
  assert.equal(cuotaMensual(1_200_000, 0, 12), 100_000);
});

test("los casos del crédito marcan la predicción elegida", () => {
  const casos = casosCredito({ monto: 10_000_000, plazo: 36, cuando: 6, tipo: "pesimista", usura: 28.34 });
  assert.deepEqual(casos.map((c) => c.id), ["hoy", "optimista", "conservadora", "pesimista", "usura"]);
  assert.equal(casos.filter((c) => c.elegida).length, 1);
  assert.equal(casos.find((c) => c.elegida).id, "pesimista");
  assert.equal(casos[0].diferencia, null);
  assert.ok(casos[1].cuota < casos[2].cuota && casos[2].cuota < casos[3].cuota && casos[3].cuota < casos[4].cuota);
});

test("el promedio del sistema pondera por monto", () => {
  const entidades = [
    { entidad: "A", tasa: 20, monto: 300, creditos: 60 },
    { entidad: "B", tasa: 30, monto: 100, creditos: 10 },
  ];
  assert.equal(promedioSistema(entidades).tasa, 22.5);
  assert.deepEqual(ordenarEntidades(entidades, "tasa").map((e) => e.entidad), ["A"], "menor tasa exige al menos 50 créditos");
  assert.deepEqual(ordenarEntidades(entidades, "monto").map((e) => e.entidad), ["A", "B"]);
});

/* ---------- Consulta y Excel ---------- */

test("la consulta refleja lo elegido", () => {
  const consulta = construirConsulta(estadoDePrueba(), new Date(2026, 10, 23, 17, 1));
  assert.equal(consulta.generado, "2026-11-23T17:01");
  assert.equal(consulta.prediccion.id, "pesimista");
  assert.equal(consulta.plazo.meses, 18);
  assert.equal(consulta.condiciones.activas, true);
  cerca(consulta.condiciones.politica, consulta.condiciones.politicaReal - 1, 1e-9, "política un punto por debajo");
  assert.equal(consulta.senda.length, HMAX);
  assert.equal(consulta.resultado.tasa, consulta.resultado.pesimista);
  assert.equal(consulta.origen.tasa, Y0);
  assert.equal(consulta.credito.filas.length, 5);
  assert.ok(consulta.indicadores.length >= 4);
});

test("el Excel es un ZIP con sus cuatro hojas", () => {
  const consulta = construirConsulta(estadoDePrueba(), new Date(2026, 10, 23, 17, 1));
  const hojas = construirHojas(consulta);
  assert.deepEqual(hojas.map((h) => h.nombre), ["Resumen", "Proyección", "Crédito", "Indicadores"]);
  assert.equal(hojas[1].filas.length, HMAX + 1);
  const bytes = crearLibro(hojas);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  const texto = new TextDecoder().decode(bytes);
  for (const parte of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet4.xml"]) {
    assert.ok(texto.includes(parte), `falta ${parte}`);
  }
  assert.equal(nombreArchivo(consulta), "TasaViva_pesimista_2026-11-23_1701.xlsx");
});

test("sin monto, el Excel se arma igual", () => {
  const consulta = construirConsulta(estadoDePrueba({ credito: { monto: 0, plazo: 36, cuando: 6 } }));
  assert.deepEqual(consulta.credito.filas, []);
  assert.ok(crearLibro(construirHojas(consulta)).length > 1000);
});

/* ---------- Fuentes, rutas y modo sin conexión ---------- */

test("el estado general resume las cuatro fuentes", () => {
  const vivo = vivoInicial();
  assert.equal(estadoGeneral(vivo).estado, "cargando");
  for (const clave of ["trm", "usura", "fed", "bancos"]) vivo[clave] = { ...vivo[clave], estado: "guardado" };
  assert.equal(estadoGeneral(vivo).texto, "Sin conexión · datos guardados");
  vivo.trm = { ...vivo.trm, estado: "vivo" };
  assert.equal(estadoGeneral(vivo).texto, "En vivo · 1 de 4 fuentes");
});

test("cada ruta tiene su vista y una ruta desconocida cae en el resumen", () => {
  assert.equal(rutaDe("#/simulador").id, "simulador");
  assert.equal(rutaDe("#credito").id, "credito");
  assert.equal(rutaDe("#/no-existe").id, "resumen");
  assert.equal(rutaDe("").id, "resumen");
  for (const ruta of RUTAS) assert.ok(existsSync(join(RAIZ, "js", "vistas", `${ruta.id}.js`)), `falta la vista ${ruta.id}`);
});

test("el modo sin conexión guarda todos los archivos de la aplicación", () => {
  const sw = readFileSync(join(RAIZ, "sw.js"), "utf8");
  const lista = [...sw.matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1]).filter((ruta) => ruta !== "./");
  for (const ruta of lista) assert.ok(existsSync(join(RAIZ, ruta)), `sw.js nombra un archivo que no existe: ${ruta}`);
  const recorrer = (carpeta) => readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    return statSync(ruta).isDirectory() ? recorrer(ruta) : [relative(RAIZ, ruta).replaceAll("\\", "/")];
  });
  for (const archivo of [...recorrer(join(RAIZ, "js")), ...recorrer(join(RAIZ, "estilos"))]) {
    assert.ok(lista.includes(archivo), `falta en sw.js: ${archivo}`);
  }
});
