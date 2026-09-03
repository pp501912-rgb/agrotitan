/* ═══════════════════════════════════════════════════════════════════
   CONSTRUIR · arma la página desde la plantilla y los datos.

     plantillas/pagina.html  +  contenido/datos.json  →  public/index.html

   Un dato que todavía no tenemos no se inventa ni se deja en blanco:
   vuelve a salir como <span class="falta">[lo que sea]</span>, igual
   que en la maqueta. Así la página siempre es honesta, aunque esté a
   medio completar, y el que la mira ve qué falta.

   Uso:
     node sitio/construir.mjs              escribe public/index.html
     node sitio/construir.mjs --verificar  compara contra la maqueta
     node sitio/construir.mjs --simulacro  muestra qué haría, sin escribir
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import { RUTAS } from "../nucleo/marca.mjs";
import { rellenar, escapar, marcadoresSinResolver } from "../nucleo/plantilla.mjs";
import { conIds, formatear } from "./mapa-datos.mjs";

/** Lee contenido/datos.json y devuelve { clave: valor } con lo cargado. */
export async function leerDatos() {
  try {
    const ficha = JSON.parse(await fs.readFile(RUTAS.datosJson, "utf8"));
    const valores = {};
    for (const c of ficha.campos || []) {
      if (String(c.valor ?? "").trim() !== "") valores[c.clave] = String(c.valor).trim();
    }
    return { ficha, valores };
  } catch {
    return { ficha: { campos: [] }, valores: {} };
  }
}

/**
 * Arma el contexto de la plantilla: un valor por aparición.
 *
 * Cargado    → el valor con su formato ("6 semanas", "USD 2.500")
 * Sin cargar → el mismo <span class="falta"> que tenía la maqueta
 */
export function contextoDeDatos(valores) {
  const dato = {};
  for (const e of conIds()) {
    const v = valores[e.clave];
    dato[e.id] = v
      ? escapar(formatear(e, v))
      : `<span class="falta">${escapar(e.espera)}</span>`;
  }
  return { dato };
}

/** Qué datos siguen sin cargar. */
export function pendientes(ficha, valores) {
  const vistas = new Set();
  return (ficha.campos || []).filter((c) => {
    if (vistas.has(c.clave)) return false;
    vistas.add(c.clave);
    return !valores[c.clave];
  });
}

/** Rellena la plantilla y devuelve el HTML. */
export async function construir(valores) {
  const plantilla = await fs.readFile(RUTAS.paginaHtml, "utf8");
  const html = rellenar(plantilla, contextoDeDatos(valores));

  const sueltos = marcadoresSinResolver(html);
  if (sueltos.length) {
    throw new Error(
      `Quedaron marcadores sin resolver: ${sueltos.join(", ")}.\n` +
      `La plantilla y el mapa de datos no coinciden. Corré  node sitio/extraer.mjs`
    );
  }
  return html;
}

/**
 * La verificación que sostiene todo esto.
 *
 * Construye la página SIN ningún dato cargado y la compara con la
 * maqueta original. Si la extracción fue correcta, tienen que salir
 * idénticas, byte por byte: lo único que hicimos fue sacar el texto a
 * un archivo aparte y volver a ponerlo.
 *
 * Cualquier diferencia significa que perdimos algo por el camino.
 */
export async function verificar() {
  const [original, reconstruida] = await Promise.all([
    fs.readFile(RUTAS.maqueta, "utf8"),
    construir({}),
  ]);

  if (original === reconstruida) return { igual: true };

  // Si no coinciden, decimos exactamente en qué línea, para poder arreglarlo.
  const a = original.split("\n");
  const b = reconstruida.split("\n");
  const difs = [];
  for (let i = 0; i < Math.max(a.length, b.length) && difs.length < 5; i++) {
    if (a[i] !== b[i]) difs.push({ linea: i + 1, original: a[i], generada: b[i] });
  }
  return { igual: false, difs, lineas: [a.length, b.length] };
}

/* ── Uso desde la terminal ─────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = new Set(process.argv.slice(2));

  if (args.has("--verificar")) {
    const r = await verificar();
    if (r.igual) {
      console.log("✓ La página reconstruida es idéntica a la maqueta.");
      process.exit(0);
    }
    console.error(`✗ Difieren. Líneas: maqueta ${r.lineas[0]}, generada ${r.lineas[1]}.`);
    for (const d of r.difs) {
      console.error(`\n  línea ${d.linea}`);
      console.error(`  maqueta : ${String(d.original).trim().slice(0, 150)}`);
      console.error(`  generada: ${String(d.generada).trim().slice(0, 150)}`);
    }
    process.exit(1);
  }

  const { ficha, valores } = await leerDatos();
  const faltan = pendientes(ficha, valores);
  const html = await construir(valores);

  if (faltan.length) {
    console.log(`Faltan ${faltan.length} de ${ficha.campos.length} datos:`);
    for (const c of faltan.slice(0, 8)) console.log(`  · ${c.seccion} — ${c.pregunta}`);
    if (faltan.length > 8) console.log(`  … y ${faltan.length - 8} más.`);
    console.log("Van a salir entre corchetes en la página.\n");
  }

  if (args.has("--simulacro")) {
    console.log(`(simulacro) escribiría ${html.length} caracteres en ${RUTAS.publicoIndex}`);
    process.exit(0);
  }

  await fs.writeFile(RUTAS.publicoIndex, html, "utf8");
  console.log(`✓ public/index.html escrito (${html.length} caracteres).`);
}
