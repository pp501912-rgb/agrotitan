/* Pruebas del respaldo.

   Lo que se prueba acá no es git —eso lo prueba git— sino las tres
   promesas que le hice al proyecto:

     1. Actualizar la app no te borra los datos que cargaste.
     2. Una pieza rehecha desde su ficha es la misma pieza.
     3. El respaldo no arrastra imágenes ni secretos.

   La segunda es la que hace honesto tener los PNG fuera del
   repositorio: si fallara, clonar en otra máquina daría piezas
   distintas de las que aprobaste.

   node --test nucleo/respaldo.test.mjs */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { RUTAS, REPO } from "./marca.mjs";
import { datosDePlaca, rehacer } from "./piezas.mjs";
import { buscarNavegador, renderizar } from "./render.mjs";

/* ── 1 · Los datos cargados no se pisan ────────────────────────── */

test("extraer.mjs no pisa contenido/datos.json si ya tiene valores", async () => {
  // Es la garantía de que yo tocando la maqueta no borra el trabajo de
  // completar los 31 datos. Estaba escrita en el código y no probada.
  const fuente = await fs.readFile(path.join(REPO, "fragua/sitio/extraer.mjs"), "utf8");

  const bloque = fuente.slice(fuente.indexOf("let yaHabia"));
  assert.match(bloque, /fs\.access\(RUTAS\.datosJson\)/,
    "tiene que mirar si el archivo existe antes de escribirlo");
  assert.match(bloque, /if \(yaHabia\)[\s\S]{0,200}no lo toco/,
    "y si existe, no puede escribirlo");

  // Y que el único writeFile de datos.json esté del lado del else.
  const escrituras = [...fuente.matchAll(/fs\.writeFile\(RUTAS\.datosJson/g)];
  assert.equal(escrituras.length, 1);
  assert.ok(escrituras[0].index > fuente.indexOf("if (yaHabia)"),
    "la escritura tiene que caer después de la comprobación");
});

/* ── 2 · Una pieza rehecha es la misma pieza ───────────────────── */

test("datosDePlaca arma la portada, los interiores y el cierre de un carrusel", () => {
  const pieza = {
    tema: "margen-bruto-enganoso",
    titular: "El mayor margen bruto puede ser la peor opción",
    formato: "carrusel",
    faltantes: [],
    placas: [
      { titulo: "Portada", texto: "a" },
      { titulo: "Medio",   texto: "b" },
      { titulo: "Cierre",  texto: "c" },
    ],
  };

  const portada = datosDePlaca(pieza, 0);
  assert.equal(portada.tipo, "portada");
  assert.equal(portada.n, 1);
  assert.equal(portada.total, 3);
  assert.equal(portada.accion, "", "la acción va sólo en la última");
  // La volanta sale del tema, con los guiones convertidos en espacios.
  assert.equal(portada.volanta, "margen bruto enganoso");

  assert.equal(datosDePlaca(pieza, 1).tipo, "interior");

  const cierre = datosDePlaca(pieza, 2);
  assert.equal(cierre.tipo, "cierre");
  assert.equal(cierre.accion, "Escribinos por WhatsApp");
});

test("una placa suelta no lleva numeración de carrusel", () => {
  const pieza = {
    tema: "tres-estudios", titular: "Titular", formato: "placa", faltantes: [],
    placas: [{ titulo: "", texto: "a" }],
  };
  const d = datosDePlaca(pieza, 0);
  assert.equal(d.tipo, undefined);
  assert.equal(d.n, undefined);
  // Sin título de placa manda el titular de la pieza.
  assert.equal(d.titular, "Titular");
});

test("una pieza con datos faltantes lleva la marca en la placa", () => {
  const pieza = {
    tema: "x", titular: "T", formato: "placa", faltantes: ["[X] hectáreas"],
    placas: [{ titulo: "", texto: "a" }],
  };
  assert.equal(datosDePlaca(pieza, 0).nota, "Faltan datos");
});

test("rehacer devuelve el mismo PNG, byte a byte, que el original", async (t) => {
  if (!(await buscarNavegador())) {
    t.skip("sin navegador headless no se puede renderizar");
    return;
  }

  const carpeta = `2026-09-05-prueba-rehacer-${process.pid}`;
  const destino = path.join(RUTAS.salida, carpeta);
  await fs.mkdir(destino, { recursive: true });

  const ficha = {
    fecha: "2026-09-05",
    creada: new Date().toISOString(),
    tema: "prueba-rehacer",
    titular: "Un titular de prueba para rehacer",
    formato: "carrusel",
    plantilla: "carrusel",
    audiencia: "inversor",
    estado: "borrador",
    faltantes: [],
    fuentes: ["prueba"],
    placas: [
      { titulo: "La tensión", texto: "El mayor margen bruto puede ser la peor opción." },
      { titulo: "El desarrollo", texto: "Lo que manda es el flujo, no el margen de un año." },
      { titulo: "El cierre", texto: "Si estás evaluando un proyecto, escribinos." },
    ],
    imagenes: ["01.png", "02.png", "03.png"],
  };

  try {
    // Primero las generamos como lo haría guardar_pieza...
    const originales = [];
    for (const [i, nombre] of ficha.imagenes.entries()) {
      const png = path.join(destino, nombre);
      await renderizar(ficha.plantilla, datosDePlaca(ficha, i), png);
      originales.push(await fs.readFile(png));
    }
    await fs.writeFile(path.join(destino, "ficha.json"), JSON.stringify(ficha, null, 2), "utf8");
    await fs.writeFile(path.join(destino, "copy.txt"), "Copy.\n", "utf8");

    // ...las borramos, como si hubieras clonado el repositorio...
    for (const nombre of ficha.imagenes) await fs.rm(path.join(destino, nombre));

    // ...y las traemos de vuelta.
    const r = await rehacer();
    const mia = r.hechas.find((h) => h.carpeta === carpeta);
    assert.ok(mia, "tendría que haber rehecho esta pieza");
    assert.equal(mia.imagenes, 3);

    for (const [i, nombre] of ficha.imagenes.entries()) {
      const ahora = await fs.readFile(path.join(destino, nombre));
      assert.ok(ahora.equals(originales[i]),
        `la placa ${nombre} salió distinta de la original`);
    }

    // Y una segunda pasada no rehace nada: ya están todas.
    const otra = await rehacer();
    assert.equal(otra.hechas.find((h) => h.carpeta === carpeta), undefined);
  } finally {
    await fs.rm(destino, { recursive: true, force: true });
  }
});

/* ── 3 · El respaldo no arrastra lo que no debe ────────────────── */

test("el .gitignore deja fuera las imágenes y los secretos, y adentro las fichas", async () => {
  const ignore = await fs.readFile(path.join(REPO, "fragua/.gitignore"), "utf8");
  const reglas = ignore.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

  assert.ok(reglas.includes("salida/**/*.png"), "las imágenes se ignoran");
  assert.ok(!reglas.includes("salida/"),
    "salida/ entera NO puede estar ignorada: adentro van las fichas y los copys");
  assert.ok(reglas.includes(".env"), "el .env nunca al repositorio");
  assert.ok(reglas.includes(".instagram.json"), "el token de Instagram tampoco");
});

test("las rutas del respaldo son las tres de contenido, y ninguna más", async () => {
  const fuente = await fs.readFile(path.join(REPO, "fragua/nucleo/respaldo.mjs"), "utf8");
  const lista = fuente.slice(
    fuente.indexOf("const RUTAS_RESPALDO"),
    fuente.indexOf("];", fuente.indexOf("const RUTAS_RESPALDO"))
  );

  for (const r of ["fragua/conocimiento/", "fragua/contenido/", "fragua/salida/"]) {
    assert.ok(lista.includes(r), `falta ${r}`);
  }
  // public/ es de publicar.mjs: mezclarlos haría que un respaldo
  // publicara el sitio sin que nadie se lo pidiera.
  assert.ok(!lista.includes('"public/"'), "el respaldo no publica el sitio");
  assert.ok(!lista.includes(".env"), "y no toca los secretos");
});

test("el respaldo automático se puede apagar desde el .env", async () => {
  const { automatico } = await import("./respaldo.mjs");
  const antes = process.env.FRAGUA_RESPALDO;
  try {
    delete process.env.FRAGUA_RESPALDO;
    assert.equal(automatico(), true, "por defecto está encendido");

    process.env.FRAGUA_RESPALDO = "manual";
    assert.equal(automatico(), false);

    process.env.FRAGUA_RESPALDO = "MANUAL";
    assert.equal(automatico(), false, "sin importar cómo lo escribas");
  } finally {
    if (antes === undefined) delete process.env.FRAGUA_RESPALDO;
    else process.env.FRAGUA_RESPALDO = antes;
  }
});
