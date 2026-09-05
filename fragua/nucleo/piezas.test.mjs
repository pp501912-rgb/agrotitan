/* Pruebas del ciclo de vida de las piezas.

   Trabajan sobre carpetas de verdad dentro de salida/, con nombres que
   empiezan con "prueba-", y las borran al terminar. Es a propósito: lo
   que importa acá es que los archivos queden bien escritos, y un doble
   del sistema de archivos no probaría eso.

   node --test nucleo/piezas.test.mjs */

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { RUTAS } from "./marca.mjs";
import { listar, abrir, aprobar, marcarPublicada, descartar } from "./piezas.mjs";

const creadas = [];

/** Deja una pieza falsa en salida/, como la dejaría guardar_pieza. */
async function crearPieza(sufijo, extra = {}) {
  // Los nombres reales empiezan con la fecha —así los arma guardar_pieza—
  // y de ahí sale el orden de la lista. Una prueba con nombres inventados
  // no probaría el orden que la app usa de verdad.
  const carpeta = `2026-09-03-prueba-${sufijo}-${creadas.length}`;
  const destino = path.join(RUTAS.salida, carpeta);
  await fs.mkdir(destino, { recursive: true });
  creadas.push(destino);

  const ficha = {
    fecha: "2026-09-03",
    tema: `prueba-${sufijo}`,
    titular: "Titular de prueba",
    formato: "placa",
    plantilla: "dato",
    audiencia: "inversor",
    estado: "borrador",
    imagenes: ["01.png"],
    faltantes: [],
    fuentes: ["prueba"],
    ...extra,
  };

  await fs.writeFile(path.join(destino, "ficha.json"), JSON.stringify(ficha, null, 2), "utf8");
  await fs.writeFile(path.join(destino, "copy.txt"), "Copy de prueba.\n", "utf8");
  return carpeta;
}

afterEach(async () => {
  while (creadas.length) {
    await fs.rm(creadas.pop(), { recursive: true, force: true }).catch(() => {});
  }
});

test("abrir devuelve la ficha con el copy adentro", async () => {
  const c = await crearPieza("abrir");
  const p = await abrir(c);
  assert.equal(p.carpeta, c);
  assert.equal(p.titular, "Titular de prueba");
  assert.match(p.copy, /Copy de prueba/);
});

test("aprobar una pieza limpia la deja lista", async () => {
  const c = await crearPieza("limpia");
  const r = await aprobar(c);
  assert.equal(r.aprobada, true);
  assert.equal((await abrir(c)).estado, "aprobada");
});

test("NO deja aprobar una pieza con datos entre corchetes", async () => {
  // Es la regla de oro otra vez, ahora en el paso de aprobación: una
  // pieza con [X] en la imagen no se puede dar por buena.
  const c = await crearPieza("faltantes", { faltantes: ["años de trayectoria"] });
  const r = await aprobar(c);

  assert.equal(r.aprobada, false);
  assert.match(r.motivo, /sin completar/);
  assert.deepEqual(r.faltantes, ["años de trayectoria"]);
  assert.equal((await abrir(c)).estado, "borrador", "no debería haber cambiado de estado");
});

test("marcar como publicada exige haberla aprobado antes", async () => {
  const c = await crearPieza("sin-aprobar");
  const r = await marcarPublicada(c);
  assert.equal(r.publicada, false);
  assert.match(r.motivo, /aprobaste/);
});

test("una pieza aprobada se puede dar por publicada y queda en el historial", async () => {
  const c = await crearPieza("publicable");
  await aprobar(c);

  const antes = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));

  try {
    const r = await marcarPublicada(c);
    const despues = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));

    assert.equal(r.publicada, true);
    assert.equal(despues.publicaciones.length, antes.publicaciones.length + 1);
    assert.equal(despues.publicaciones.at(-1).tema, "prueba-publicable");
    assert.equal(despues.publicaciones.at(-1).carpeta, c);
  } finally {
    // El historial es un archivo del proyecto: se restaura pase lo que
    // pase. Sin el finally, una aserción que falla deja basura adentro y
    // la corrida siguiente arranca sucia.
    await fs.writeFile(RUTAS.historial, JSON.stringify(antes, null, 2) + "\n", "utf8");
  }
});

test("listar ordena por fecha, de la más nueva a la más vieja", async () => {
  const vieja = await crearPieza("aaa", { fecha: "2026-08-01" });
  const nueva = await crearPieza("bbb", { fecha: "2026-09-03" });

  // Renombramos para que el prefijo sea el que tendrían de verdad.
  const { rename } = await import("node:fs/promises");
  const dir = (n) => path.join(RUTAS.salida, n);
  const viejaReal = vieja.replace("2026-09-03", "2026-08-01");
  await rename(dir(vieja), dir(viejaReal));
  creadas[creadas.indexOf(dir(vieja))] = dir(viejaReal);

  const nombres = (await listar()).map((p) => p.carpeta);
  assert.ok(nombres.indexOf(nueva) < nombres.indexOf(viejaReal),
    `la del 3 de septiembre tendría que ir antes que la del 1 de agosto`);
});

test("dentro del mismo día manda la marca de tiempo", async () => {
  const primera = await crearPieza("ccc", { creada: "2026-09-03T09:00:00.000Z" });
  const segunda = await crearPieza("ccc2", { creada: "2026-09-03T18:00:00.000Z" });

  const nombres = (await listar()).map((p) => p.carpeta);
  assert.ok(nombres.indexOf(segunda) < nombres.indexOf(primera));
});

test("descartar no deja salirse de salida/", async () => {
  // Sin esta comprobación, una carpeta como "../../public" borraría el
  // sitio entero.
  for (const intento of ["../../public", "..", "../conocimiento"]) {
    const r = await descartar(intento);
    assert.equal(r.borrada, false, `dejó pasar «${intento}»`);
    assert.match(r.motivo, /fuera de salida/i);
  }

  // Y el repositorio sigue entero.
  await fs.access(RUTAS.publicoIndex);
  await fs.access(RUTAS.conocimiento);
});

test("descartar sí borra una pieza de verdad", async () => {
  const c = await crearPieza("descartable");
  assert.equal((await descartar(c)).borrada, true);
  await assert.rejects(() => fs.access(path.join(RUTAS.salida, c)));
});

test("marcar a mano una pieza ya publicada por una red no la anota dos veces", async () => {
  // El historial es lo que evita repetir un tema. Una entrada duplicada
  // no rompe nada visible, pero ensucia justamente eso.
  const c = await crearPieza("ya-anotada", {
    estado: "publicada",
    linkedin: { id: "urn:li:share:1", permalink: "https://x" },
  });
  const antes = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));

  try {
    const r = await marcarPublicada(c);
    assert.equal(r.publicada, false);
    assert.match(r.motivo, /ya está publicada y anotada/);

    const despues = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));
    assert.equal(despues.publicaciones.length, antes.publicaciones.length);
  } finally {
    await fs.writeFile(RUTAS.historial, JSON.stringify(antes, null, 2) + "\n", "utf8");
  }
});
