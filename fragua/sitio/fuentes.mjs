/* ═══════════════════════════════════════════════════════════════════
   FUENTES · baja las tipografías al repositorio, una sola vez.

   La maqueta cargaba IBM Plex desde Google Fonts, y eso le avisa a
   Google cada visita que alguien entró. Contradice el «sin rastreo»
   del proyecto entero, así que las fuentes pasan a vivir acá.

   Auto-alojarlas está expresamente permitido: IBM Plex y Rajdhani son
   SIL Open Font License 1.1.

   Y hay un segundo motivo, menos obvio: nucleo/render.mjs incrusta
   estos mismos archivos en cada placa de Instagram. Sin ellos las
   placas salen con la tipografía del sistema, que es lo que venía
   pasando.

   Uso:  npm run fuentes
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

import { RUTAS, FUENTES } from "../nucleo/marca.mjs";

/* Se puede apuntar a otro lado para probar sin salir a internet. */
const API = () => process.env.FRAGUA_FUENTES_API || "https://fonts.googleapis.com/css2";

/* Sin un navegador moderno en el User-Agent, Google devuelve formatos
   viejos —ttf, eot— en vez de woff2. Es la única razón de esta línea. */
const NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* Nos quedamos con el alfabeto latino. El resto de los subconjuntos
   —cirílico, griego, vietnamita— es peso muerto para un sitio en
   castellano: multiplicaría por cinco lo que baja el visitante.

   Google escribe el nombre del subconjunto en un comentario justo
   arriba de cada bloque, y ésa es la señal confiable. Mirar el
   unicode-range no lo es: una primera versión de esto buscaba
   U+0100-024F para reconocer el latino extendido, pero Google lo
   declara como U+0100-02BA, así que lo descartaba en silencio y las
   letras poco comunes quedaban en la tipografía del sistema. */
const LATINO = /^latin(-ext)?$/;

/** Qué familias y pesos pedirle a Google, deducido de FUENTES. */
export function pedidos() {
  const porFamilia = new Map();

  for (const f of FUENTES) {
    if (!porFamilia.has(f.familia)) porFamilia.set(f.familia, []);
    porFamilia.get(f.familia).push(f);
  }

  return [...porFamilia].map(([familia, caras]) => {
    const hayItalica = caras.some((c) => c.estilo === "italic");

    // El formato de Google: con itálicas, "ital,wght@0,400;1,400";
    // sin itálicas, "wght@400;600". Los ejes van en orden alfabético
    // y los valores ordenados, o devuelve 400.
    const ejes = hayItalica
      ? caras.map((c) => `${c.estilo === "italic" ? 1 : 0},${c.peso}`)
      : caras.map((c) => String(c.peso));

    ejes.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

    return {
      familia,
      caras,
      consulta: `family=${familia.replace(/ /g, "+")}:${hayItalica ? "ital,wght" : "wght"}@${ejes.join(";")}`,
    };
  });
}

/**
 * Separa la hoja de estilo de Google en bloques @font-face.
 *
 * Google manda un bloque por subconjunto y por peso, cada uno con su
 * unicode-range. Nos interesan sólo los latinos.
 */
export function bloquesLatinos(css) {
  const bloques = [];

  // Cada bloque viene precedido de su comentario: /* latin-ext */
  const conNombre = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;

  for (const m of css.matchAll(conNombre)) {
    if (!LATINO.test(m[1])) continue;
    const cuerpo = m[2];

    const url = cuerpo.match(/url\((https?:\/\/[^)]+\.woff2)\)/)?.[1];
    if (!url) continue;

    bloques.push({
      familia: cuerpo.match(/font-family:\s*['"]([^'"]+)['"]/)?.[1] || "",
      estilo:  cuerpo.match(/font-style:\s*(\w+)/)?.[1] || "normal",
      peso:    Number(cuerpo.match(/font-weight:\s*(\d+)/)?.[1] || 400),
      url,
    });
  }

  return bloques;
}

/** Baja un archivo y lo devuelve como Buffer. */
async function bajar(url) {
  const r = await fetch(url, { headers: { "user-agent": NAVEGADOR }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Las caras que faltan en public/fuentes/. */
export async function faltantes() {
  const falta = [];
  for (const f of FUENTES) {
    try { await fs.access(path.join(RUTAS.fuentes, f.archivo)); }
    catch { falta.push(f); }
  }
  return falta;
}

/**
 * Baja todo lo que declare FUENTES y no esté ya en disco.
 *
 * Devuelve qué bajó y qué no pudo encontrar, en vez de lanzar: si
 * Google cambia un peso de lugar, es mejor saber cuál falta que
 * quedarse sin ninguna.
 */
export async function traer({ todas = false } = {}) {
  await fs.mkdir(RUTAS.fuentes, { recursive: true });

  const pendientes = todas ? FUENTES : await faltantes();
  if (!pendientes.length) return { bajadas: [], sinEncontrar: [], yaEstaban: FUENTES.length };

  const bajadas = [];
  const sinEncontrar = [];

  for (const p of pedidos()) {
    // Sólo pedimos las familias que tengan algo pendiente.
    const suyas = pendientes.filter((f) => f.familia === p.familia);
    if (!suyas.length) continue;

    const url = `${API()}?${p.consulta}&display=swap`;
    const r = await fetch(url, { headers: { "user-agent": NAVEGADOR }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`Google Fonts respondió ${r.status} para ${p.familia}.`);

    const bloques = bloquesLatinos(await r.text());

    for (const cara of suyas) {
      const b = bloques.find((x) => x.peso === cara.peso && x.estilo === cara.estilo);
      if (!b) { sinEncontrar.push(cara); continue; }

      await fs.writeFile(path.join(RUTAS.fuentes, cara.archivo), await bajar(b.url));
      bajadas.push(cara);
    }
  }

  await escribirLeeme();
  return { bajadas, sinEncontrar, yaEstaban: FUENTES.length - pendientes.length };
}

/** Deja anotado de dónde salieron y bajo qué licencia. */
async function escribirLeeme() {
  const familias = [...new Set(FUENTES.map((f) => f.familia))];

  const texto =
    "TIPOGRAFÍAS DE AGROTITAN\n" +
    "════════════════════════\n\n" +
    "Estos archivos los bajó `npm run fuentes` desde Google Fonts, una sola\n" +
    "vez. Están acá para que el sitio NO tenga que pedírselos a Google en\n" +
    "cada visita: así ninguna persona que entre le queda registrada a un\n" +
    "tercero.\n\n" +
    "Familias: " + familias.join(", ") + ".\n\n" +
    "Licencia: SIL Open Font License 1.1, que permite expresamente\n" +
    "auto-alojarlas y redistribuirlas. El texto completo y el proyecto de\n" +
    "cada una:\n" +
    "  IBM Plex   https://github.com/IBM/plex\n" +
    "  Rajdhani   https://github.com/EbenSorkin/Rajdhani\n\n" +
    "Sólo se guardó el subconjunto latino. El sitio está en castellano y\n" +
    "el resto —cirílico, griego, vietnamita— multiplicaría por cinco lo\n" +
    "que baja el visitante sin que nadie lo lea.\n\n" +
    "Si faltan, las placas de Instagram salen con la tipografía del\n" +
    "sistema y el publicador del sitio se niega a publicar.\n";

  await fs.writeFile(path.join(RUTAS.fuentes, "LEEME.txt"), texto, "utf8");
}

/* ── Uso desde la terminal ─────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const todas = process.argv.includes("--todas");

  const falta = await faltantes();
  if (!falta.length && !todas) {
    console.log(`Las ${FUENTES.length} tipografías ya están en public/fuentes/.`);
    console.log("Para bajarlas de nuevo igual:  npm run fuentes -- --todas");
    process.exit(0);
  }

  console.log(`Bajando ${todas ? FUENTES.length : falta.length} tipografía(s) a public/fuentes/…\n`);

  try {
    const r = await traer({ todas });
    for (const b of r.bajadas) console.log(`  ✓ ${b.archivo}`);

    if (r.sinEncontrar.length) {
      console.error(`\nNo encontré ${r.sinEncontrar.length} en la respuesta de Google:`);
      for (const f of r.sinEncontrar) console.error(`  · ${f.familia} ${f.peso} ${f.estilo}`);
      console.error("\nProbablemente ese peso ya no exista. Avisá y lo corrijo en marca.mjs.");
      process.exit(1);
    }

    console.log(`\n${r.bajadas.length} tipografía(s) guardadas. El sitio ya no habla con Google.`);
  } catch (e) {
    console.error(`\nNo pude bajarlas: ${e.message}\n`);
    console.error("Necesita internet una sola vez. Si estás detrás de un proxy que");
    console.error("bloquea fonts.googleapis.com, bajalas a mano de github.com/IBM/plex");
    console.error(`y dejalas en public/fuentes/ con estos nombres:\n`);
    for (const f of await faltantes()) console.error(`  ${f.archivo}`);
    process.exit(1);
  }
}
