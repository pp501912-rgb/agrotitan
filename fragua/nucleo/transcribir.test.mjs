/* Pruebas de la transcripción.

   No hay ningún Whisper de verdad en el entorno donde se escribió esto
   —pypi, Hugging Face y GitHub están bloqueados—, así que las pruebas
   usan motores simulados: scripts que emiten exactamente la salida que
   emite cada motor real, un .txt en la carpeta de salida.

   Eso deja probado todo menos el modelo: la detección, la conversión,
   la invocación, el parseo, y sobre todo el camino de "no hay ningún
   Whisper instalado", que es el primero que ve cualquiera.

   node --test nucleo/transcribir.test.mjs */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buscarMotor, olvidarMotor, estado, transcribir } from "./transcribir.mjs";

let taller;          // carpeta temporal con los motores simulados
const guardadas = {};

const VARIABLES = [
  "FRAGUA_WHISPER", "FRAGUA_WHISPER_MODELO", "FRAGUA_WHISPER_GGML",
  "FRAGUA_FFMPEG", "PATH",
];

beforeEach(async () => {
  taller = await fs.mkdtemp(path.join(os.tmpdir(), "prueba-whisper-"));
  for (const v of VARIABLES) guardadas[v] = process.env[v];

  // PATH vacío: arrancamos sin ningún motor, que es el estado real de
  // una máquina recién instalada.
  process.env.PATH = taller;
  delete process.env.FRAGUA_WHISPER;
  delete process.env.FRAGUA_WHISPER_GGML;
  delete process.env.FRAGUA_FFMPEG;
  olvidarMotor();
});

afterEach(async () => {
  for (const v of VARIABLES) {
    if (guardadas[v] === undefined) delete process.env[v];
    else process.env[v] = guardadas[v];
  }
  olvidarMotor();
  await fs.rm(taller, { recursive: true, force: true }).catch(() => {});
});

/**
 * Deja un motor simulado en el PATH.
 *
 * `guion` recibe los argumentos y tiene que dejar el .txt donde lo
 * dejaría el motor real. Se registra además cada llamada en llamadas.log,
 * para poder comprobar con qué argumentos lo invocamos.
 */
async function simular(nombre, guion) {
  const ruta = path.join(taller, nombre);
  await fs.writeFile(ruta,
    // Shebang absoluto y PATH propio: el PATH del proceso apunta sólo al
    // taller para que la detección no vea nada más, y sin esto el guion
    // no encontraría ni printf.
    `#!/bin/bash\n` +
    `export PATH=/usr/bin:/bin\n` +
    `echo "$@" >> "${taller}/llamadas.log"\n` +
    guion + "\n", { mode: 0o755 });
  olvidarMotor();
  return ruta;
}

async function llamadas() {
  try { return (await fs.readFile(path.join(taller, "llamadas.log"), "utf8")).trim().split("\n"); }
  catch { return []; }
}

/** Un archivo de audio de mentira, para que exista. */
async function audioFalso(nombre = "nota.ogg") {
  const ruta = path.join(taller, nombre);
  await fs.writeFile(ruta, "no es audio de verdad, pero existe");
  return ruta;
}

/* ── Detección ─────────────────────────────────────────────────── */

test("sin ningún Whisper instalado, lo dice y explica cómo instalarlo", async () => {
  assert.equal(await buscarMotor(), null);

  const e = await estado();
  assert.equal(e.activo, false);
  assert.match(e.motivo, /pip install whisper-ctranslate2/);
  assert.match(e.motivo, /whisper\.cpp/);
});

test("transcribir sin motor falla con ese mismo mensaje, no con un error de sistema", async () => {
  const audio = await audioFalso();
  await assert.rejects(
    () => transcribir(audio),
    (e) => /pip install whisper-ctranslate2/.test(e.message)
  );
});

test("prefiere whisper-ctranslate2 cuando están los dos", async () => {
  // Es el único que lee el Opus de Telegram sin ffmpeg.
  await simular("whisper-ctranslate2", 'exit 0');
  await simular("whisper-cli", 'exit 0');

  const m = await buscarMotor();
  assert.equal(m.id, "whisper-ctranslate2");
});

test("encuentra whisper.cpp cuando es el único", async () => {
  await simular("whisper-cli", 'exit 0');
  assert.equal((await buscarMotor()).id, "whisper.cpp");
});

test("encuentra el whisper original cuando es el único", async () => {
  await simular("whisper", 'exit 0');
  assert.equal((await buscarMotor()).id, "whisper");
});

test("FRAGUA_WHISPER manda sobre lo que haya en el PATH", async () => {
  await simular("whisper-ctranslate2", 'exit 0');
  const propio = await simular("whisper-cli", 'exit 0');

  process.env.FRAGUA_WHISPER = propio;
  olvidarMotor();

  const m = await buscarMotor();
  assert.equal(m.ruta, propio);
  assert.equal(m.id, "whisper.cpp");
  assert.equal(m.aMano, true);
});

/* ── Requisitos de cada motor ──────────────────────────────────── */

test("whisper.cpp sin modelo .bin avisa qué falta", async () => {
  await simular("whisper-cli", 'exit 0');
  const e = await estado();
  assert.equal(e.activo, false);
  assert.match(e.motivo, /FRAGUA_WHISPER_GGML/);
});

test("whisper.cpp sin ffmpeg avisa que no lee las notas de voz", async () => {
  await simular("whisper-cli", 'exit 0');
  process.env.FRAGUA_WHISPER_GGML = path.join(taller, "ggml-small.bin");

  const e = await estado();
  assert.equal(e.activo, false);
  assert.match(e.motivo, /Opus/);
  assert.match(e.motivo, /ffmpeg/);
});

test("whisper-ctranslate2 no pide ffmpeg ni modelo aparte", async () => {
  await simular("whisper-ctranslate2", 'exit 0');
  const e = await estado();
  assert.equal(e.activo, true);
  assert.equal(e.motor, "whisper-ctranslate2");
  assert.equal(e.modelo, "small");
});

test("el modelo se puede cambiar por el .env", async () => {
  await simular("whisper-ctranslate2", 'exit 0');
  process.env.FRAGUA_WHISPER_MODELO = "large-v3-turbo";
  assert.equal((await estado()).modelo, "large-v3-turbo");
});

/* ── Transcripción ─────────────────────────────────────────────── */

/** El guion que imita a whisper-ctranslate2: escribe <nombre>.txt en --output_dir. */
const GUION_CT2 = `
salida=""; entrada="$1"
while [ $# -gt 0 ]; do
  case "$1" in --output_dir) salida="$2"; shift;; esac
  shift
done
base=$(basename "\${entrada%.*}")
printf 'Che, anotá que el lote de nogales del fondo viene atrasado.' > "$salida/$base.txt"
`;

test("transcribe y devuelve el texto, el motor y el modelo", async () => {
  await simular("whisper-ctranslate2", GUION_CT2);
  const audio = await audioFalso();

  const r = await transcribir(audio);
  assert.match(r.texto, /lote de nogales/);
  assert.equal(r.motor, "whisper-ctranslate2");
  assert.equal(r.modelo, "small");
  assert.equal(typeof r.segundos, "number");
});

test("le pasa el idioma español y el formato txt", async () => {
  await simular("whisper-ctranslate2", GUION_CT2);
  await transcribir(await audioFalso());

  const [args] = await llamadas();
  assert.match(args, /--language es/);
  assert.match(args, /--output_format txt/);
  assert.match(args, /--model small/);
});

test("NO convierte cuando el motor lee el audio directo", async () => {
  await simular("whisper-ctranslate2", GUION_CT2);
  await simular("ffmpeg", 'echo "ffmpeg no debería haber corrido" >&2; exit 1');

  await transcribir(await audioFalso("nota.ogg"));

  const hechas = await llamadas();
  assert.ok(!hechas.some((l) => /-ar 16000/.test(l)), "convirtió cuando no hacía falta");
});

test("SÍ convierte a WAV de 16 kHz mono cuando el motor lo necesita", async () => {
  // whisper.cpp con un Opus: sin la conversión no lo puede leer.
  const guionCpp = `
salida=""; prev=""
for a in "$@"; do
  if [ "$prev" = "-of" ]; then salida="$a"; fi
  prev="$a"
done
printf 'Transcripción de prueba con whisper punto cpp.' > "$salida.txt"
`;
  await simular("whisper-cli", guionCpp);
  await simular("ffmpeg", 'for a in "$@"; do prev2=$prev1; prev1=$a; done; touch "$prev1"; exit 0');

  process.env.FRAGUA_WHISPER_GGML = path.join(taller, "ggml-small.bin");
  olvidarMotor();

  const r = await transcribir(await audioFalso("nota.ogg"));
  assert.match(r.texto, /whisper punto cpp/);

  const hechas = await llamadas();
  const conversion = hechas.find((l) => /-ar 16000/.test(l));
  assert.ok(conversion, "no convirtió y whisper.cpp no lee Opus");
  assert.match(conversion, /-ac 1/);
  assert.match(conversion, /pcm_s16le/);
});

test("un WAV no se vuelve a convertir aunque el motor lo pida", async () => {
  const guionCpp = `
prev=""; salida=""
for a in "$@"; do if [ "$prev" = "-of" ]; then salida="$a"; fi; prev="$a"; done
printf 'ya era wav' > "$salida.txt"
`;
  await simular("whisper-cli", guionCpp);
  await simular("ffmpeg", 'echo "no hacía falta convertir" >&2; exit 1');
  process.env.FRAGUA_WHISPER_GGML = path.join(taller, "ggml-small.bin");
  olvidarMotor();

  const r = await transcribir(await audioFalso("nota.wav"));
  assert.match(r.texto, /ya era wav/);
  assert.ok(!(await llamadas()).some((l) => /-ar 16000/.test(l)));
});

/* ── Cuando algo sale mal ──────────────────────────────────────── */

test("un audio que no existe falla antes de invocar al motor", async () => {
  await simular("whisper-ctranslate2", GUION_CT2);
  await assert.rejects(() => transcribir(path.join(taller, "no-existe.ogg")));
  assert.deepEqual(await llamadas(), [], "no tendría que haber invocado al motor");
});

test("si el motor no deja texto, lo dice en vez de devolver vacío", async () => {
  await simular("whisper-ctranslate2", 'exit 0');   // corre bien pero no escribe nada
  const audio = await audioFalso();
  await assert.rejects(() => transcribir(audio), /no dejó ningún archivo de texto/);
});

test("un .txt vacío tampoco pasa por bueno", async () => {
  await simular("whisper-ctranslate2", `
salida=""; entrada="$1"
while [ $# -gt 0 ]; do case "$1" in --output_dir) salida="$2"; shift;; esac; shift; done
base=$(basename "\${entrada%.*}")
printf '   \\n  ' > "$salida/$base.txt"
`);
  const audio = await audioFalso();
  await assert.rejects(() => transcribir(audio), /no devolvió texto/);
});

test("si el motor falla, el error sale a la superficie", async () => {
  await simular("whisper-ctranslate2", 'echo "no pude abrir el archivo" >&2; exit 1');
  const audio = await audioFalso();
  await assert.rejects(() => transcribir(audio));
});
