/* ═══════════════════════════════════════════════════════════════════
   TRANSCRIBIR · las notas de voz se vuelven texto.

   Mismo criterio que el renderizador de piezas: usa el Whisper que ya
   tengas instalado, no se descarga nada.

   Hay un detalle que decide casi todo el diseño: las notas de voz de
   Telegram vienen en OGG/Opus.

     whisper-ctranslate2   decodifica Opus solo y se baja el modelo la
                           primera vez. Un comando para instalarlo.
     whisper.cpp           decodifica wav, mp3, flac y ogg-vorbis, pero
                           NO Opus: para una nota de voz necesita ffmpeg
                           que la convierta antes.
     whisper (el original) anda, pero es bastante más lento.

   Por eso el primero es el preferido, y por eso la conversión con
   ffmpeg se hace sólo cuando el motor la necesita.

   Uso desde la terminal:
     node nucleo/transcribir.mjs audio.ogg
   ═══════════════════════════════════════════════════════════════════ */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ejecutar = promisify(execFile);

const MODELO = () => process.env.FRAGUA_WHISPER_MODELO || "small";

/* ── Los motores ───────────────────────────────────────────────────
   Cada uno sabe cómo lo invocan, qué formatos lee y dónde deja el
   texto. Agregar otro es agregar una entrada acá.
   ────────────────────────────────────────────────────────────────── */

const MOTORES = [
  {
    id: "whisper-ctranslate2",
    comandos: ["whisper-ctranslate2"],
    // Decodifica con PyAV, así que se traga el Opus de Telegram sin ayuda.
    necesitaWav: false,
    argumentos: (entrada, salida, modelo) => [
      entrada,
      "--model", modelo,
      "--language", "es",
      "--output_format", "txt",
      "--output_dir", salida,
      "--verbose", "False",
    ],
  },
  {
    id: "whisper.cpp",
    comandos: ["whisper-cli", "whisper-cpp", "main"],
    // miniaudio no trae Opus: hay que pasarle un WAV sí o sí.
    necesitaWav: true,
    // El modelo va como archivo .bin, no como nombre.
    necesitaGgml: true,
    argumentos: (entrada, salida, modelo) => [
      "-m", modelo,
      "-f", entrada,
      "-l", "es",
      "-otxt",
      "-of", path.join(salida, path.parse(entrada).name),
      "-np",           // sin la cháchara de progreso
    ],
  },
  {
    id: "whisper",
    comandos: ["whisper"],
    necesitaWav: false,
    argumentos: (entrada, salida, modelo) => [
      entrada,
      "--model", modelo,
      "--language", "Spanish",
      "--output_format", "txt",
      "--output_dir", salida,
      "--verbose", "False",
    ],
  },
];

/**
 * ¿Está este comando en el PATH? Devuelve la ruta o null.
 *
 * Recorremos el PATH nosotros en vez de invocar `which` o `where`. La
 * primera versión los usaba y era frágil por partida doble: `which` es
 * un programa que también tiene que estar en el PATH, y en Windows
 * `where` se comporta distinto según la consola. Buscar a mano es media
 * docena de líneas y funciona igual en los tres sistemas.
 */
async function enElPath(comando) {
  const separador = process.platform === "win32" ? ";" : ":";
  const carpetas = (process.env.PATH || "").split(separador).filter(Boolean);

  // En Windows un comando puede ser .exe, .bat o .cmd; PATHEXT lo dice.
  const sufijos = process.platform === "win32"
    ? ["", ...(process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").filter(Boolean)]
    : [""];

  for (const carpeta of carpetas) {
    for (const sufijo of sufijos) {
      const candidato = path.join(carpeta, comando + sufijo);
      try {
        const info = await fs.stat(candidato);
        if (info.isFile()) return candidato;
      } catch { /* siguiente */ }
    }
  }
  return null;
}

let motorCacheado;

/**
 * Devuelve el motor a usar, o null si no hay ninguno.
 *
 * FRAGUA_WHISPER gana sobre todo lo demás: si pusiste una ruta a mano,
 * se usa esa. El tipo se deduce del nombre del archivo.
 */
export async function buscarMotor() {
  if (motorCacheado !== undefined) return motorCacheado;

  const aMano = process.env.FRAGUA_WHISPER;
  if (aMano) {
    const nombre = path.basename(aMano).toLowerCase();
    const definicion =
      MOTORES.find((m) => m.comandos.some((c) => nombre.includes(c))) ||
      MOTORES.find((m) => m.id === "whisper.cpp");
    motorCacheado = { ...definicion, ruta: aMano, aMano: true };
    return motorCacheado;
  }

  for (const definicion of MOTORES) {
    for (const comando of definicion.comandos) {
      const ruta = await enElPath(comando);
      if (ruta) { motorCacheado = { ...definicion, ruta }; return motorCacheado; }
    }
  }

  motorCacheado = null;
  return null;
}

/**
 * Olvida todo lo detectado y obliga a volver a buscar.
 *
 * Tiene que limpiar también el ffmpeg: cachear el motor pero no el
 * convertidor deja media detección vieja, y con eso whisper.cpp creía
 * que no había ffmpeg aunque lo hubieran instalado después.
 */
export function olvidarMotor() {
  motorCacheado = undefined;
  ffmpegCacheado = undefined;
}

/** ffmpeg, sólo si hace falta convertir. */
let ffmpegCacheado;
async function buscarFfmpeg() {
  if (ffmpegCacheado !== undefined) return ffmpegCacheado;
  ffmpegCacheado = process.env.FRAGUA_FFMPEG || await enElPath("ffmpeg");
  return ffmpegCacheado;
}

/* ── Estado, para la pantalla del panel ────────────────────────── */

const COMO_INSTALAR =
  "No encontré ningún Whisper instalado.\n\n" +
  "La forma más simple, un solo comando:\n" +
  "    pip install whisper-ctranslate2\n\n" +
  "Se baja el modelo solo la primera vez y entiende las notas de voz de " +
  "Telegram sin nada más.\n\n" +
  "Si preferís no usar Python: bajá whisper-bin-x64.zip de " +
  "github.com/ggml-org/whisper.cpp/releases, más un modelo .bin y ffmpeg, " +
  "y poné la ruta en el .env con FRAGUA_WHISPER.";

/** { activo, motor, modelo } o el motivo, en castellano. */
export async function estado() {
  const motor = await buscarMotor();
  if (!motor) return { activo: false, motivo: COMO_INSTALAR };

  if (motor.necesitaGgml && !process.env.FRAGUA_WHISPER_GGML) {
    return {
      activo: false,
      motivo:
        `Encontré ${motor.id} en ${motor.ruta}, pero le falta el modelo.\n` +
        `Bajá un archivo .bin (por ejemplo ggml-small.bin) y poné su ruta en ` +
        `el .env, en FRAGUA_WHISPER_GGML.`,
    };
  }

  if (motor.necesitaWav && !(await buscarFfmpeg())) {
    return {
      activo: false,
      motivo:
        `Encontré ${motor.id}, pero no lee el Opus de las notas de voz de ` +
        `Telegram y necesita ffmpeg para convertirlas. Instalá ffmpeg, o ` +
        `pasate a whisper-ctranslate2, que no lo necesita.`,
    };
  }

  return {
    activo: true,
    motor: motor.id,
    ruta: motor.ruta,
    modelo: motor.necesitaGgml ? path.basename(process.env.FRAGUA_WHISPER_GGML) : MODELO(),
  };
}

/* ── Conversión ────────────────────────────────────────────────── */

/** Los formatos que whisper.cpp lee sin ayuda. Opus no está. */
const SIN_CONVERTIR = new Set([".wav", ".mp3", ".flac"]);

async function aWav(entrada, carpeta) {
  const ffmpeg = await buscarFfmpeg();
  if (!ffmpeg) throw new Error("Hace falta ffmpeg para convertir este audio y no lo encuentro.");

  const salida = path.join(carpeta, path.parse(entrada).name + ".wav");
  await ejecutar(ffmpeg, [
    "-hide_banner", "-loglevel", "error",
    "-i", entrada,
    "-ar", "16000",   // Whisper trabaja a 16 kHz
    "-ac", "1",       // mono
    "-c:a", "pcm_s16le",
    "-y", salida,
  ], { timeout: 180_000 });

  return salida;
}

/* ── Transcripción ─────────────────────────────────────────────── */

/**
 * Transcribe un archivo de audio.
 *
 * @param {string} archivo  ruta al audio
 * @returns {{texto, motor, modelo, segundos}}
 */
export async function transcribir(archivo) {
  const est = await estado();
  if (!est.activo) throw new Error(est.motivo);

  const motor = await buscarMotor();
  await fs.access(archivo);   // que falle acá y no adentro del motor

  const arranque = Date.now();
  const temporal = await fs.mkdtemp(path.join(os.tmpdir(), "fragua-audio-"));

  try {
    let entrada = archivo;
    if (motor.necesitaWav && !SIN_CONVERTIR.has(path.extname(archivo).toLowerCase())) {
      entrada = await aWav(archivo, temporal);
    }

    const modelo = motor.necesitaGgml ? process.env.FRAGUA_WHISPER_GGML : MODELO();
    await ejecutar(motor.ruta, motor.argumentos(entrada, temporal, modelo), {
      timeout: 20 * 60_000,     // un audio largo con un modelo grande tarda
      maxBuffer: 32 << 20,
    });

    const texto = await leerSalida(temporal, entrada);
    if (!texto.trim()) {
      throw new Error("El motor corrió pero no devolvió texto. ¿El audio tiene voz?");
    }

    return {
      texto: texto.trim(),
      motor: motor.id,
      modelo: est.modelo,
      segundos: Math.round((Date.now() - arranque) / 1000),
    };
  } finally {
    await fs.rm(temporal, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Lee el .txt que dejó el motor.
 *
 * Los tres escriben un .txt en la carpeta de salida, pero no siempre con
 * el nombre que uno espera —whisper.cpp le agrega su propio sufijo según
 * la versión— así que buscamos el único .txt que haya en vez de adivinar.
 */
async function leerSalida(carpeta, entrada) {
  const esperado = path.join(carpeta, path.parse(entrada).name + ".txt");
  try { return await fs.readFile(esperado, "utf8"); } catch { /* seguimos buscando */ }

  const sueltos = (await fs.readdir(carpeta)).filter((n) => n.endsWith(".txt"));
  if (sueltos.length === 1) {
    return fs.readFile(path.join(carpeta, sueltos[0]), "utf8");
  }
  if (sueltos.length === 0) {
    throw new Error("El motor no dejó ningún archivo de texto.");
  }
  throw new Error(`El motor dejó varios .txt y no sé cuál es: ${sueltos.join(", ")}`);
}

/* ── Uso desde la terminal ─────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const archivo = process.argv[2];
  if (!archivo) {
    const est = await estado();
    console.log(est.activo
      ? `Motor: ${est.motor} (${est.ruta})\nModelo: ${est.modelo}\n\nUso: node nucleo/transcribir.mjs <audio>`
      : est.motivo);
    process.exit(est.activo ? 0 : 1);
  }
  const r = await transcribir(archivo);
  console.log(`\n[${r.motor} · ${r.modelo} · ${r.segundos}s]\n\n${r.texto}\n`);
}
