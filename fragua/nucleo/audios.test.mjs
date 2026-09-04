/* Pruebas del camino completo: de una nota de voz a una nota del
   conocimiento.

   Igual que las de transcribir.mjs, usan un whisper simulado — acá no
   hay ninguno de verdad. Lo que se prueba es todo lo que rodea al
   modelo, que es donde estuvo el error más caro de esta tanda.

   node --test nucleo/audios.test.mjs */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { RUTAS } from "./marca.mjs";
import { olvidarMotor } from "./transcribir.mjs";
import { CARPETA, listar, procesar, procesarPendientes } from "./audios.mjs";
import { leerNotas } from "./conocimiento.mjs";

let taller;
const guardadas = {};
const VARIABLES = ["PATH", "FRAGUA_WHISPER", "FRAGUA_WHISPER_MODELO", "OLLAMA_URL"];
const creados = [];

const TRANSCRIPCION =
  "Che anotá que en el lote del fondo las horas de frío no las midieron " +
  "antes de plantar, y eso en avellano define todo el resto del proyecto.";

beforeEach(async () => {
  taller = await fs.mkdtemp(path.join(os.tmpdir(), "prueba-audios-"));
  for (const v of VARIABLES) guardadas[v] = process.env[v];

  process.env.PATH = taller;
  // Ollama apagado: queremos probar el camino sin limpieza, que es el
  // que va a correr en una máquina recién instalada.
  process.env.OLLAMA_URL = "http://127.0.0.1:1";
  delete process.env.FRAGUA_WHISPER;
  olvidarMotor();

  await fs.mkdir(CARPETA, { recursive: true });
});

afterEach(async () => {
  for (const v of VARIABLES) {
    if (guardadas[v] === undefined) delete process.env[v];
    else process.env[v] = guardadas[v];
  }
  olvidarMotor();

  while (creados.length) await fs.rm(creados.pop(), { force: true }).catch(() => {});
  await fs.rm(taller, { recursive: true, force: true }).catch(() => {});
});

/** Un whisper simulado que devuelve siempre el mismo texto. */
async function simularWhisper(texto = TRANSCRIPCION) {
  const ruta = path.join(taller, "whisper-ctranslate2");
  await fs.writeFile(ruta,
    `#!/bin/bash\n` +
    `export PATH=/usr/bin:/bin\n` +
    `salida=""; entrada="$1"\n` +
    `while [ $# -gt 0 ]; do case "$1" in --output_dir) salida="$2"; shift;; esac; shift; done\n` +
    `base=$(basename "\${entrada%.*}")\n` +
    `cat > "$salida/$base.txt" <<'FIN'\n${texto}\nFIN\n`,
    { mode: 0o755 });
  olvidarMotor();
}

/** Deja un audio pendiente y anota los archivos a limpiar después. */
async function audioPendiente(nombre) {
  const audio = path.join(CARPETA, nombre);
  await fs.writeFile(audio, "no es audio de verdad");
  creados.push(audio);
  creados.push(path.join(RUTAS.notas, "voz-" + path.parse(nombre).name + ".md"));
  return nombre;
}

/* ── Lo que importa de verdad ──────────────────────────────────── */

test("LA TRANSCRIPCIÓN LLEGA AL CONOCIMIENTO", async () => {
  // Este es el caso que hay que cuidar. La primera versión dejaba la
  // nota adentro de notas/audios/, y como el conocimiento lee notas/ sin
  // entrar en subcarpetas, la transcripción no llegaba nunca: mandabas
  // la nota de voz, se transcribía bien, y HERALDO seguía sin
  // encontrarla. Todo el sentido de la función se perdía en una línea.
  await simularWhisper();
  const nombre = await audioPendiente("2030-01-01T00-00-00.ogg");

  await procesar(nombre);

  const notas = await leerNotas();
  const nuestra = notas.find((n) => n.archivo.includes("2030-01-01"));
  assert.ok(nuestra, "la nota no está donde el conocimiento la busca");
  assert.match(nuestra.texto, /horas de frío/);
});

test("el audio original nunca se borra", async () => {
  await simularWhisper();
  const nombre = await audioPendiente("2030-01-02T00-00-00.ogg");

  await procesar(nombre);

  await fs.access(path.join(CARPETA, nombre));   // sigue ahí
});

/* ── El ciclo ──────────────────────────────────────────────────── */

test("transcribe y deja la nota con el texto", async () => {
  await simularWhisper();
  const nombre = await audioPendiente("2030-01-03T00-00-00.ogg");

  const r = await procesar(nombre);
  assert.equal(r.estado, "transcrito");
  assert.match(r.texto, /lote del fondo/);
  assert.equal(r.motor, "whisper-ctranslate2");
  // Sin Ollama, se archiva la cruda: es el respaldo esperado.
  assert.equal(r.limpiado, false);
});

test("no vuelve a transcribir lo que ya tiene nota", async () => {
  await simularWhisper();
  const nombre = await audioPendiente("2030-01-04T00-00-00.ogg");

  await procesar(nombre);
  const otra = await procesar(nombre);
  assert.equal(otra.estado, "ya-estaba");
});

test("con rehacer sí la vuelve a hacer", async () => {
  await simularWhisper();
  const nombre = await audioPendiente("2030-01-05T00-00-00.ogg");

  await procesar(nombre);
  const otra = await procesar(nombre, { rehacer: true });
  assert.equal(otra.estado, "transcrito");
});

test("listar distingue lo pendiente de lo transcrito", async () => {
  await simularWhisper();
  const a = await audioPendiente("2030-01-06T00-00-00.ogg");
  const b = await audioPendiente("2030-01-07T00-00-00.ogg");

  await procesar(a);

  const lista = await listar();
  const uno = lista.find((x) => x.archivo === a);
  const dos = lista.find((x) => x.archivo === b);

  assert.equal(uno.transcrito, true);
  assert.match(uno.texto, /horas de frío/);
  assert.equal(dos.transcrito, false);
  assert.equal(dos.texto, null);
});

/* ── El atraso ─────────────────────────────────────────────────── */

test("procesar pendientes es idempotente", async () => {
  await simularWhisper();
  await audioPendiente("2030-01-08T00-00-00.ogg");
  await audioPendiente("2030-01-09T00-00-00.ogg");

  const primera = await procesarPendientes();
  assert.equal(primera.hechos.length, 2);

  const segunda = await procesarPendientes();
  assert.equal(segunda.hechos.length, 0, "volvió a transcribir lo que ya estaba");
});

test("un audio que falla no frena a los demás", async () => {
  // El simulado falla si el nombre trae "roto".
  const ruta = path.join(taller, "whisper-ctranslate2");
  await fs.writeFile(ruta,
    `#!/bin/bash\nexport PATH=/usr/bin:/bin\n` +
    `case "$1" in *roto*) echo "no pude abrir" >&2; exit 1;; esac\n` +
    `salida=""; entrada="$1"\n` +
    `while [ $# -gt 0 ]; do case "$1" in --output_dir) salida="$2"; shift;; esac; shift; done\n` +
    `base=$(basename "\${entrada%.*}")\n` +
    `printf 'anduvo' > "$salida/$base.txt"\n`,
    { mode: 0o755 });
  olvidarMotor();

  await audioPendiente("2030-01-10-roto.ogg");
  await audioPendiente("2030-01-11T00-00-00.ogg");

  const r = await procesarPendientes();
  assert.equal(r.hechos.length, 1, "el que anda tendría que haberse hecho igual");
  assert.equal(r.fallados.length, 1);
  assert.match(r.fallados[0].archivo, /roto/);
});

test("sin Whisper devuelve el motivo y no toca nada", async () => {
  await audioPendiente("2030-01-12T00-00-00.ogg");

  const r = await procesarPendientes();
  assert.equal(r.motor, null);
  assert.match(r.motivo, /pip install whisper-ctranslate2/);
  assert.deepEqual(r.hechos, []);
});
