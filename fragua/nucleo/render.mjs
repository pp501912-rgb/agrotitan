/* ═══════════════════════════════════════════════════════════════════
   RENDER · convierte una plantilla HTML de pieza en un PNG 1080×1350.

   No usa Playwright. Usa el navegador que ya tenés instalado, en modo
   headless, por línea de comandos. En Windows Edge siempre está, así
   que no hay nada que descargar.

   Las tipografías se incrustan en el HTML como data: URI. Es más
   robusto que apuntar a los archivos: Chrome tiene restricciones para
   leer archivos locales desde una página local, y así las esquivamos.

   Uso desde la terminal:
     node nucleo/render.mjs cita datos.json salida.png
   ═══════════════════════════════════════════════════════════════════ */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { RUTAS, FUENTES, PIEZA } from "./marca.mjs";
import { rellenar } from "./plantilla.mjs";

const ejecutar = promisify(execFile);

/* ── Encontrar el navegador ────────────────────────────────────── */

function candidatos() {
  const p = process.platform;
  if (p === "win32") {
    const pf   = process.env["ProgramFiles"]        || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"]   || "C:\\Program Files (x86)";
    const local = process.env["LOCALAPPDATA"]       || "";
    return [
      // Edge primero: en Windows siempre está instalado.
      `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
      local && `${local}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf}\\Chromium\\Application\\chrome.exe`,
    ].filter(Boolean);
  }
  if (p === "darwin") {
    return [
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  return [
    "/usr/bin/microsoft-edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
}

let navegadorCacheado;

/**
 * Devuelve la ruta del navegador a usar, o null si no hay ninguno.
 * Respeta FRAGUA_NAVEGADOR si la definiste a mano en el .env.
 */
export async function buscarNavegador() {
  if (navegadorCacheado !== undefined) return navegadorCacheado;

  const lista = [];
  if (process.env.FRAGUA_NAVEGADOR) lista.push(process.env.FRAGUA_NAVEGADOR);
  lista.push(...candidatos());

  // Los que trae Playwright, por si alguien lo instaló para otra cosa.
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pw) {
    try {
      for (const d of await fs.readdir(pw)) {
        if (!d.startsWith("chromium-")) continue;
        lista.push(
          path.join(pw, d, "chrome-linux", "chrome"),
          path.join(pw, d, "chrome-win", "chrome.exe"),
          path.join(pw, d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
        );
      }
    } catch { /* la carpeta no existe: seguimos con el resto */ }
  }

  for (const ruta of lista) {
    try { await fs.access(ruta); navegadorCacheado = ruta; return ruta; } catch { /* siguiente */ }
  }
  navegadorCacheado = null;
  return null;
}

/* ── Tipografías incrustadas ───────────────────────────────────── */

let cssFuentes;

/** Arma los @font-face con las woff2 en base64. Se calcula una sola vez. */
export async function fuentesIncrustadas() {
  if (cssFuentes !== undefined) return cssFuentes;

  const partes = [];
  for (const f of FUENTES) {
    try {
      const bin = await fs.readFile(path.join(RUTAS.fuentes, f.archivo));
      partes.push(
        `@font-face{font-family:"${f.familia}";font-weight:${f.peso};` +
        `font-style:${f.estilo};font-display:block;` +
        `src:url(data:font/woff2;base64,${bin.toString("base64")}) format("woff2")}`
      );
    } catch {
      // Si falta el archivo, la pieza sale con la tipografía del sistema.
      // Se ve distinto pero no se rompe.
    }
  }
  cssFuentes = partes.join("\n");
  return cssFuentes;
}

/* ── Render ────────────────────────────────────────────────────── */

/**
 * Rellena una plantilla de pieza y devuelve el HTML completo, listo
 * para renderizar. Exportada aparte para poder previsualizar en el
 * panel sin generar el PNG.
 */
export async function htmlDePieza(plantilla, datos) {
  const [base, cuerpo, fuentes, isotipo] = await Promise.all([
    fs.readFile(path.join(RUTAS.piezas, "base.css"), "utf8"),
    fs.readFile(path.join(RUTAS.piezas, `${plantilla}.html`), "utf8"),
    fuentesIncrustadas(),
    leerIsotipo(),
  ]);

  // El isotipo entra como {{{isotipo}}} en cualquier plantilla, sin que
  // quien la escribe tenga que acordarse de pasarlo.
  const ctx = { isotipo, ...derivados(datos) };

  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8">
<style>${fuentes}</style>
<style>${base}</style>
</head><body>${rellenar(cuerpo, ctx)}</body></html>`;
}

/**
 * Campos que la plantilla necesita pero que no tiene sentido pedirle a
 * quien escribe la pieza: se deducen de lo que ya hay.
 *
 *   tipo: "portada"  →  esPortada: true
 *   un titular largo →  claseTitular: "titular--largo"
 *
 * Los tamaños del titular están calibrados sobre el lienzo de 1080 px:
 * más de 46 caracteres no entra en tres renglones al tamaño grande.
 */
function derivados(datos) {
  const d = { ...datos };

  if (d.tipo) {
    d.esPortada  = d.tipo === "portada";
    d.esInterior = d.tipo === "interior";
    d.esCierre   = d.tipo === "cierre";
  }

  if (!d.claseTitular && typeof d.titular === "string") {
    const largo = d.titular.replace(/<[^>]*>/g, "").length;
    if (largo > 62)      d.claseTitular = "titular--largo";
    else if (largo < 24) d.claseTitular = "titular--corto";
  }

  if (!d.claseCifra && typeof d.cifra === "string") {
    if (d.cifra.replace(/<[^>]*>/g, "").length > 5) d.claseCifra = "cifra--larga";
  }

  return d;
}

let isotipoCacheado;

/** La "A catastral" de la marca, ya lista para incrustar. */
async function leerIsotipo() {
  if (isotipoCacheado !== undefined) return isotipoCacheado;
  try {
    const svg = await fs.readFile(path.join(RUTAS.publico, "img", "isotipo-a.svg"), "utf8");
    // Los comentarios largos del original no aportan nada al render.
    isotipoCacheado = svg.replace(/<!--[\s\S]*?-->/g, "").trim();
  } catch {
    isotipoCacheado = "";
  }
  return isotipoCacheado;
}

/**
 * Renderiza una pieza a PNG.
 * @param {string} plantilla  cita | dato | carrusel | servicio
 * @param {object} datos      el contexto de la plantilla
 * @param {string} destino    ruta del .png a escribir
 */
export async function renderizar(plantilla, datos, destino) {
  const navegador = await buscarNavegador();
  if (!navegador) {
    throw new Error(
      "No encontré ningún navegador para renderizar las piezas.\n" +
      "En Windows debería estar Edge. Si no, instalá Google Chrome, o\n" +
      "poné la ruta a mano en el .env:  FRAGUA_NAVEGADOR=C:\\ruta\\chrome.exe"
    );
  }

  const html = await htmlDePieza(plantilla, datos);

  const temporal = await fs.mkdtemp(path.join(os.tmpdir(), "fragua-"));
  const archivoHtml = path.join(temporal, "pieza.html");

  try {
    await fs.writeFile(archivoHtml, html, "utf8");
    await fs.mkdir(path.dirname(destino), { recursive: true });

    await ejecutar(navegador, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
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

      "--force-device-scale-factor=1",
      "--default-background-color=00000000",
      `--window-size=${PIEZA.ancho},${PIEZA.alto}`,
      `--screenshot=${destino}`,
      pathAUrl(archivoHtml),
    ], { timeout: 60_000 });

    // El navegador puede terminar con código 0 y no haber escrito nada.
    const info = await fs.stat(destino).catch(() => null);
    if (!info || info.size === 0) {
      throw new Error(`El navegador no generó la imagen: ${destino}`);
    }
    return destino;
  } finally {
    await fs.rm(temporal, { recursive: true, force: true }).catch(() => {});
  }
}

/** file:// bien formado en Windows y en Unix. */
function pathAUrl(p) {
  const abs = path.resolve(p).replace(/\\/g, "/");
  return "file://" + (abs.startsWith("/") ? abs : "/" + abs);
}

/* ── Uso desde la terminal ─────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const [plantilla, archivoDatos, destino] = process.argv.slice(2);
  if (!plantilla || !archivoDatos || !destino) {
    console.error("Uso: node nucleo/render.mjs <plantilla> <datos.json> <salida.png>");
    process.exit(1);
  }
  const datos = JSON.parse(await fs.readFile(archivoDatos, "utf8"));
  await renderizar(plantilla, datos, destino);
  console.log(`Listo: ${destino}`);
}
