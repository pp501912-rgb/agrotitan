/* ═══════════════════════════════════════════════════════════════════
   PUBLICAR · reconstruye la página, la commitea y la empuja.

   Cloudflare toma el cambio desde GitHub. Si tu cuenta no está
   conectada a GitHub, el push igual sirve como respaldo y este script
   te avisa que falta el paso manual.

   Tres resguardos, en este orden:
     1. Guarda una copia de lo que había antes de sobrescribir.
     2. Se niega a publicar si quedan datos sin completar, salvo que
        se lo pidas expresamente con --igual-publicar.
     3. Muestra el diff y espera confirmación, salvo --sin-preguntar.

   Uso:
     node sitio/publicar.mjs --simulacro        muestra qué haría
     node sitio/publicar.mjs                    pregunta antes de empujar
     node sitio/publicar.mjs --sin-preguntar    para el panel
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";

import { RUTAS, REPO } from "../nucleo/marca.mjs";
import { git, ramaActual, empujar as empujarRutas } from "../nucleo/git.mjs";
import { construir, leerDatos, pendientes } from "./construir.mjs";

export { ramaActual };

/**
 * Deja public/index.html actualizado y devuelve qué cambió.
 * No toca git: eso es el paso siguiente y se decide aparte.
 *
 * Con { escribir: false } no modifica nada — es lo que usa --simulacro.
 * Un simulacro que igual pisa el archivo no es un simulacro.
 */
export async function actualizarSitio({ escribir = true } = {}) {
  const { ficha, valores } = await leerDatos();
  const faltan = pendientes(ficha, valores);
  const html = await construir(valores);

  let anterior = null;
  try { anterior = await fs.readFile(RUTAS.publicoIndex, "utf8"); } catch { /* no existía */ }

  if (anterior === html) return { faltan, sinCambios: true, respaldo: null, html };
  if (!escribir) return { faltan, sinCambios: false, respaldo: null, html, simulado: true };

  // Copia de seguridad antes de pisar nada. Se guarda al lado, con fecha.
  let respaldo = null;
  if (anterior !== null) {
    const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    respaldo = path.join(RUTAS.salida, "respaldos", `index-${sello}.html`);
    await fs.mkdir(path.dirname(respaldo), { recursive: true });
    await fs.writeFile(respaldo, anterior, "utf8");
  }

  await fs.writeFile(RUTAS.publicoIndex, html, "utf8");
  return { faltan, sinCambios: false, respaldo, html };
}

/** Cuántas líneas cambiarían, sin tocar el archivo. */
function resumenDeCambio(anterior, nuevo) {
  const a = (anterior || "").split("\n");
  const b = nuevo.split("\n");
  let iguales = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) iguales++;
  return `${a.length} líneas → ${b.length} líneas (${Math.max(a.length, b.length) - iguales} distintas)`;
}

/** El diff de lo que cambió en public/, para mirarlo antes de empujar. */
export async function diffDelSitio() {
  try { return await git("diff", "--stat", "--", "public/"); }
  catch { return ""; }
}

/** Commit y push de la página y sus datos. El reintento vive en nucleo/git. */
export async function empujar(mensaje) {
  return empujarRutas(mensaje, ["public/", "fragua/contenido/"]);
}

/* ── Uso desde la terminal ─────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = new Set(process.argv.slice(2));

  const { ficha, valores } = await leerDatos();
  const faltan = pendientes(ficha, valores);

  if (faltan.length && !args.has("--igual-publicar")) {
    console.error(`Faltan ${faltan.length} de ${ficha.campos.length} datos de la página:\n`);
    for (const c of faltan) console.error(`  · ${c.seccion} — ${c.pregunta}`);
    console.error(
      `\nVan a salir entre corchetes en la página publicada.\n` +
      `Si querés publicarla así igual:  node sitio/publicar.mjs --igual-publicar`
    );
    process.exit(1);
  }

  const simulacro = args.has("--simulacro");
  const r = await actualizarSitio({ escribir: !simulacro });

  if (r.sinCambios) {
    console.log("public/index.html ya estaba al día. No hay nada que publicar.");
    process.exit(0);
  }

  if (simulacro) {
    const anterior = await fs.readFile(RUTAS.publicoIndex, "utf8").catch(() => "");
    console.log("(simulacro) no escribí ni commiteé nada.");
    console.log(`public/index.html cambiaría: ${resumenDeCambio(anterior, r.html)}`);
    process.exit(0);
  }

  if (r.respaldo) console.log(`Copia de la versión anterior: ${path.relative(REPO, r.respaldo)}`);

  const diff = await diffDelSitio();
  if (diff.trim()) console.log(`\n${diff}`);

  if (!args.has("--sin-preguntar")) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const r2 = await rl.question(`\n¿Publico en la rama ${await ramaActual()}? [s/N] `);
    rl.close();
    if (!/^s/i.test(r2.trim())) { console.log("Cancelado. Los archivos quedan escritos."); process.exit(0); }
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const res = await empujar(`Actualizar el sitio (${fecha})`);
  console.log(res.sinCambios
    ? "Git no vio cambios que commitear."
    : `✓ Publicado en la rama ${res.rama}. Cloudflare debería tomarlo en un minuto.`);
}
