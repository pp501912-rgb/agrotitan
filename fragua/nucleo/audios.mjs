/* ═══════════════════════════════════════════════════════════════════
   AUDIOS · de una nota de voz a una nota del conocimiento.

   El audio original NUNCA se borra, y la nota guarda siempre la
   transcripción cruda además de la limpia. Si la limpieza se come una
   palabra —el nombre de una zona, una cifra— el original sigue ahí y se
   puede recuperar.

   La limpieza la hace Ollama: sacar muletillas y ruido de ruta es
   trabajo de volumen donde el error se descarta, y además así el audio
   no sale de tu PC. Si Ollama no está, se archiva la cruda y listo.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

import { RUTAS } from "./marca.mjs";
import { transcribir, estado as estadoWhisper } from "./transcribir.mjs";
import * as ollama from "../motores/ollama.mjs";

/** Dónde viven los audios que manda el bot. */
export const CARPETA = path.join(RUTAS.notas, "audios");

/** Las extensiones que consideramos audio. */
const EXTENSIONES = new Set([".ogg", ".oga", ".opus", ".mp3", ".m4a", ".wav", ".flac", ".webm"]);

/* ── Inventario ────────────────────────────────────────────────── */

/**
 * Los audios archivados, con su transcripción si ya la tienen.
 *
 * La nota de un audio se llama igual pero con .md al lado, así que
 * saber si algo está pendiente es mirar si ese archivo existe. Sin
 * base de datos ni índice que se pueda desincronizar.
 */
export async function listar() {
  let nombres;
  try { nombres = await fs.readdir(CARPETA); } catch { return []; }

  const audios = [];
  for (const nombre of nombres) {
    if (!EXTENSIONES.has(path.extname(nombre).toLowerCase())) continue;

    const completo = path.join(CARPETA, nombre);
    const nota = notaDe(completo);
    let transcripcion = null;
    try { transcripcion = await fs.readFile(nota, "utf8"); } catch { /* pendiente */ }

    const info = await fs.stat(completo).catch(() => null);
    audios.push({
      archivo: nombre,
      kb: info ? Math.round(info.size / 1024) : 0,
      fecha: info ? info.mtime.toISOString().slice(0, 10) : null,
      transcrito: Boolean(transcripcion),
      texto: transcripcion ? soloElCuerpo(transcripcion) : null,
    });
  }

  return audios.sort((a, b) => b.archivo.localeCompare(a.archivo));
}

/**
 * La nota que le corresponde a un audio.
 *
 * Va en conocimiento/notas/, NO al lado del audio dentro de audios/.
 * La primera versión la dejaba junto al .ogg, y como el conocimiento
 * lee notas/ sin entrar en subcarpetas, la transcripción no llegaba
 * nunca a la base: mandabas la nota de voz, se transcribía bien, y
 * HERALDO seguía sin encontrarla. Todo el sentido de la función se
 * perdía en una línea.
 */
function notaDe(audio) {
  return path.join(RUTAS.notas, "voz-" + path.parse(audio).name + ".md");
}

/** Saca el encabezado y devuelve lo que se lee. */
function soloElCuerpo(md) {
  return md.replace(/^#.*$/m, "").replace(/<!--[\s\S]*?-->/g, "").trim();
}

/* ── Limpieza ──────────────────────────────────────────────────── */

const INSTRUCCION_LIMPIEZA =
  "Te paso la transcripción automática de una nota de voz grabada por un " +
  "ingeniero agrónomo, muchas veces manejando. Devolvé el mismo texto " +
  "ordenado para leer:\n\n" +
  "· Sacá muletillas, repeticiones y arranques en falso.\n" +
  "· Poné puntuación y separá en párrafos.\n" +
  "· Corregí lo que sea claramente un error de transcripción.\n\n" +
  "NO resumas, NO agregues nada y NO cambies ninguna cifra, nombre de zona " +
  "ni término técnico. Si algo no se entiende, dejalo tal cual entre " +
  "corchetes.\n\n" +
  "Devolvé sólo el texto, sin comentarios.\n\n---\n\n";

/**
 * Limpia una transcripción con Ollama.
 * Nunca lanza: si no se puede, devuelve null y se archiva la cruda.
 */
export async function limpiar(crudo) {
  const est = await ollama.estado();
  if (!est.activo) return null;

  try {
    const limpio = await ollama.generar(INSTRUCCION_LIMPIEZA + crudo, {
      sistema: "Español rioplatense. No inventes nada.",
      temperatura: 0.2,
    });

    // Red de seguridad: si volvió mucho más corto, algo se comió. Nos
    // quedamos con la cruda, que es la que seguro está completa.
    if (!limpio || limpio.length < crudo.length * 0.5) return null;
    return limpio.trim();
  } catch { return null; }
}

/* ── El paso completo ──────────────────────────────────────────── */

/**
 * Transcribe un audio y deja la nota al lado.
 *
 * @param {string} archivo   nombre dentro de conocimiento/notas/audios/
 * @param {object} opciones  { rehacer, limpiarConOllama }
 */
export async function procesar(archivo, { rehacer = false, limpiarConOllama = true } = {}) {
  const completo = path.isAbsolute(archivo) ? archivo : path.join(CARPETA, archivo);
  const nota = notaDe(completo);

  if (!rehacer) {
    try {
      await fs.access(nota);
      return { estado: "ya-estaba", nota: path.basename(nota) };
    } catch { /* está pendiente, seguimos */ }
  }

  const r = await transcribir(completo);
  const limpio = limpiarConOllama ? await limpiar(r.texto) : null;

  const fecha = new Date().toISOString().slice(0, 10);
  const cuerpo = [
    `# Nota de voz · ${path.parse(completo).name}`,
    ``,
    `<!-- ${fecha} · ${r.motor} (${r.modelo}) · ${r.segundos}s · audio: ${path.basename(completo)} -->`,
    ``,
    limpio || r.texto,
    ...(limpio ? [
      ``,
      `<details>`,
      `<summary>Transcripción cruda</summary>`,
      ``,
      r.texto,
      ``,
      `</details>`,
    ] : []),
    ``,
  ].join("\n");

  await fs.writeFile(nota, cuerpo, "utf8");

  return {
    estado: "transcrito",
    nota: path.basename(nota),
    texto: limpio || r.texto,
    crudo: r.texto,
    limpiado: Boolean(limpio),
    motor: r.motor,
    modelo: r.modelo,
    segundos: r.segundos,
  };
}

/**
 * Procesa todo lo que quedó pendiente.
 *
 * Los que fallan no frenan a los demás y quedan para el próximo intento:
 * un audio cortado no puede bloquear los diez que vienen atrás.
 */
export async function procesarPendientes({ limpiarConOllama = true } = {}) {
  const est = await estadoWhisper();
  if (!est.activo) return { motor: null, motivo: est.motivo, hechos: [], fallados: [] };

  const pendientes = (await listar()).filter((a) => !a.transcrito);
  const hechos = [];
  const fallados = [];

  for (const a of pendientes) {
    try {
      const r = await procesar(a.archivo, { limpiarConOllama });
      hechos.push({ archivo: a.archivo, ...r });
    } catch (e) {
      fallados.push({ archivo: a.archivo, error: e.message });
    }
  }

  return { motor: est.motor, pendientes: pendientes.length, hechos, fallados };
}

/* ── Uso desde la terminal ─────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await procesarPendientes();

  if (!r.motor) { console.error(`\n${r.motivo}\n`); process.exit(1); }

  if (r.pendientes === 0) {
    console.log("No hay audios pendientes de transcribir.");
    process.exit(0);
  }

  console.log(`\nMotor: ${r.motor}\n`);
  for (const h of r.hechos) {
    console.log(`✓ ${h.archivo} → ${h.nota}  (${h.segundos}s${h.limpiado ? ", limpiado con Ollama" : ""})`);
  }
  for (const f of r.fallados) {
    console.log(`✗ ${f.archivo} — ${f.error}`);
  }
  console.log(`\n${r.hechos.length} de ${r.pendientes} listos.` +
    (r.fallados.length ? ` ${r.fallados.length} quedaron para el próximo intento.` : ""));
}
