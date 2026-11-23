/* Deja los datos del estudio disponibles fuera del navegador.
   `datos.js` asigna `window.DATOS`; aquí se le entrega un `window` de mentira.
   Este archivo debe importarse antes que cualquier módulo de la aplicación. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

globalThis.window = {};
new Function("window", readFileSync(join(RAIZ, "datos.js"), "utf8"))(globalThis.window);
