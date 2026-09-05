/* ═══════════════════════════════════════════════════════════════════
   PDF · el carrusel, para LinkedIn.

   LinkedIn sacó el carrusel de imágenes deslizable de las
   publicaciones orgánicas. Hoy el único formato que se desliza es el
   documento: un PDF, que LinkedIn muestra con flechas y contador de
   páginas. Es exactamente el formato que le sirve al contenido de
   AgroTitan, que es didáctico y encadenado.

   No hace falta ninguna biblioteca. Es la misma máquina que ya produce
   los PNG —el navegador que tenés instalado, en modo headless— con
   --print-to-pdf en lugar de --screenshot.

   La página del PDF mide lo mismo que la placa, 1080 × 1350, expresado
   en pulgadas porque es lo único que entiende la impresión.
   ═══════════════════════════════════════════════════════════════════ */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PIEZA } from "./marca.mjs";
import { buscarNavegador, htmlDePieza } from "./render.mjs";

const ejecutar = promisify(execFile);

/* Chrome imprime a 96 puntos por pulgada. 1080/96 = 11.25 pulgadas de
   ancho por 14.0625 de alto: la misma proporción 4:5 de la placa. */
const PPP = 96;

/** file:// bien formado en Windows y en Unix. */
function pathAUrl(p) {
  const abs = path.resolve(p).replace(/\\/g, "/");
  return "file://" + (abs.startsWith("/") ? abs : "/" + abs);
}

/**
 * Arma un PDF de una página por placa.
 *
 * @param {string} plantilla   cuál de piezas/*.html
 * @param {object[]} placas    los datos de cada placa, ya derivados
 * @param {string} destino     dónde dejar el .pdf
 */
export async function pdfDePieza(plantilla, placas, destino) {
  const navegador = await buscarNavegador();
  if (!navegador) {
    throw new Error(
      "No encontré ningún navegador para armar el PDF.\n" +
      "Es el mismo que hace falta para las imágenes: Edge, Chrome o Chromium."
    );
  }
  if (!placas.length) throw new Error("Un PDF sin placas no es un carrusel.");

  // Cada placa es su propia página. El salto va ANTES de cada una menos
  // la primera: puesto después, Chrome agrega una página final en blanco
  // que en LinkedIn se ve como una diapositiva vacía al final.
  const paginas = [];
  for (const [i, datos] of placas.entries()) {
    const html = await htmlDePieza(plantilla, datos);
    const cuerpo = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"));
    paginas.push(
      `<section class="hoja"${i ? ' style="page-break-before:always"' : ""}>${cuerpo}</section>`
    );
  }

  // Del HTML de la primera placa reusamos el <head>: ahí están las
  // tipografías incrustadas y el CSS de las piezas.
  const primera = await htmlDePieza(plantilla, placas[0]);
  const cabeza = primera.slice(primera.indexOf("<head>") + 6, primera.indexOf("</head>"));

  const ancho = PIEZA.ancho / PPP;
  const alto = PIEZA.alto / PPP;

  const documento = `<!doctype html><html lang="es-AR"><head>${cabeza}
<style>
  /* Sin márgenes: la placa ocupa la hoja entera, como en Instagram. */
  @page { size: ${ancho}in ${alto}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #0A0A0A; }
  .hoja { width: ${PIEZA.ancho}px; height: ${PIEZA.alto}px; overflow: hidden; }
  /* Chrome descarta los fondos al imprimir salvo que se le pida. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head><body>${paginas.join("\n")}</body></html>`;

  const temporal = await fs.mkdtemp(path.join(os.tmpdir(), "fragua-pdf-"));
  const archivoHtml = path.join(temporal, "carrusel.html");

  try {
    await fs.writeFile(archivoHtml, documento, "utf8");
    await fs.mkdir(path.dirname(destino), { recursive: true });

    await ejecutar(navegador, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      // Chrome, aunque sea headless, sale a internet solo: busca
      // actualizaciones, resuelve dominios y manda telemetría. Nada de eso
      // hace falta para fotografiar una placa, tarda, y en un proyecto que
      // se define por no rastrear a nadie es lo mínimo apagarlo acá.
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--metrics-recording-only",

      `--print-to-pdf=${destino}`,
      pathAUrl(archivoHtml),
    ], { timeout: 90_000 });

    // El navegador puede terminar con código 0 y no escribir nada.
    const info = await fs.stat(destino).catch(() => null);
    if (!info || info.size === 0) {
      throw new Error(`El navegador no generó el PDF: ${destino}`);
    }
    return { destino, paginas: placas.length, bytes: info.size };
  } finally {
    await fs.rm(temporal, { recursive: true, force: true }).catch(() => {});
  }
}
