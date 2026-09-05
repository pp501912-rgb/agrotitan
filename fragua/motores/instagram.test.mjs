/* Pruebas de la publicación en Instagram.

   No hay credenciales de Meta ni salida a graph.instagram.com desde
   acá, así que estas pruebas levantan dos servidores locales: uno que
   responde como la API de Meta documentada y otro que responde como el
   Worker de la bandeja. Lo que se prueba es nuestro lado —el orden de
   las llamadas, la cuota, el refresco del token, qué pasa cuando Meta
   falla a mitad de camino— que es donde puede haber errores nuestros.

   La primera publicación real queda pendiente del primer intento en la
   PC; lo que sigue es todo lo que se puede verificar sin Meta.

   node --test motores/instagram.test.mjs */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { RUTAS } from "../nucleo/marca.mjs";
import * as instagram from "./instagram.mjs";
import * as vitrina from "../nucleo/vitrina.mjs";
import { publicarEnInstagram } from "../nucleo/piezas.mjs";

const CUENTA = "17841400000000000";

/* ── El doble de Meta ──────────────────────────────────────────── */

/** Lo que pidió cada llamada, en orden. Es lo que miran las pruebas. */
let llamadas = [];

/** Cuántas publicaciones dice Meta que ya usaste en las últimas 24 h. */
let usadas = 0;

/** Un ruta => una vez que falle. Para probar el corte a mitad de camino. */
let romperEn = null;

let meta, bandeja, tmp;

/** Un servidor mínimo que aplica `manejar` a método, ruta y parámetros. */
function levantar(manejar) {
  return new Promise((listo) => {
    const s = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://local");
      const trozos = [];
      for await (const t of req) trozos.push(t);
      const crudo = Buffer.concat(trozos);

      const parametros = Object.fromEntries(url.searchParams);
      if (req.method === "POST" && (req.headers["content-type"] || "").includes("urlencoded")) {
        for (const [k, v] of new URLSearchParams(crudo.toString("utf8"))) parametros[k] = v;
      }

      const r = await manejar(req.method, url.pathname, parametros, crudo, req.headers);
      res.writeHead(r.codigo || 200, { "content-type": r.tipo || "application/json; charset=utf-8" });
      res.end(r.tipo ? r.cuerpo : JSON.stringify(r.cuerpo));
    });
    s.listen(0, "127.0.0.1", () => listo(s));
  });
}

const puerto = (s) => `http://127.0.0.1:${s.address().port}`;

before(async () => {
  meta = await levantar((metodo, ruta, parametros) => {
    llamadas.push({ metodo, ruta, parametros });

    if (!parametros.access_token) {
      return { codigo: 400, cuerpo: { error: { message: "Falta el token." } } };
    }
    if (romperEn && ruta.endsWith(romperEn.ruta) && romperEn.despues-- <= 0) {
      return { codigo: 400, cuerpo: { error: { message: romperEn.mensaje } } };
    }

    if (ruta === "/refresh_access_token") {
      return { cuerpo: { access_token: "token-refrescado", expires_in: 60 * 86400 } };
    }
    if (ruta === `/${CUENTA}/content_publishing_limit`) {
      return { cuerpo: { data: [{ config: { quota_total: 50 }, quota_usage: usadas }] } };
    }
    if (ruta === `/${CUENTA}/media`) {
      const n = llamadas.filter((l) => l.ruta.endsWith("/media")).length;
      return { cuerpo: { id: `contenedor-${n}` } };
    }
    if (ruta === `/${CUENTA}/media_publish`) {
      usadas++;
      return { cuerpo: { id: "publicacion-1" } };
    }
    if (ruta === "/publicacion-1") {
      return { cuerpo: { permalink: "https://www.instagram.com/p/ABC123/" } };
    }
    return { codigo: 404, cuerpo: { error: { message: `Ruta desconocida: ${ruta}` } } };
  });

  // El doble de la bandeja: guarda la imagen en memoria y devuelve su URL.
  const guardadas = new Map();
  bandeja = await levantar(async (metodo, ruta, parametros, crudo, cabeceras) => {
    if (metodo === "POST" && ruta === "/i") {
      if (cabeceras["x-bandeja-token"] !== "token-de-prueba") {
        return { codigo: 401, cuerpo: { error: "No autorizado." } };
      }
      const id = String(guardadas.size + 1).padStart(32, "0");
      guardadas.set(id, crudo);
      return { cuerpo: { id, url: `${puerto(bandeja)}/i/${id}` } };
    }
    if (metodo === "POST" && ruta === "/i/borrar") {
      const { ids = [] } = JSON.parse(crudo.toString("utf8") || "{}");
      for (const id of ids) guardadas.delete(id);
      return { cuerpo: { borradas: ids.length, quedan: guardadas.size } };
    }
    if (metodo === "GET" && ruta === "/i/cuantas") {
      return { cuerpo: { quedan: guardadas.size } };
    }
    return { codigo: 404, cuerpo: { error: "No existe." } };
  });

  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fragua-ig-"));

  process.env.IG_API = puerto(meta);
  process.env.IG_ARCHIVO = path.join(tmp, "instagram.json");
  process.env.IG_CUENTA = CUENTA;
  process.env.IG_TOKEN = "token-semilla";
  process.env.BANDEJA_URL = puerto(bandeja);
  process.env.BANDEJA_TOKEN = "token-de-prueba";
});

after(async () => {
  meta.close();
  bandeja.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

beforeEach(async () => {
  llamadas = [];
  usadas = 0;
  romperEn = null;
  process.env.IG_TOKEN = "token-semilla";
  process.env.IG_CUENTA = CUENTA;
  await fs.rm(process.env.IG_ARCHIVO, { force: true });
});

const rutasDe = () => llamadas.map((l) => `${l.metodo} ${l.ruta}`);
const cuantasQuedanEnLaBandeja = async () =>
  (await (await fetch(`${puerto(bandeja)}/i/cuantas`)).json()).quedan;

/* ── 1 · Sin configurar ────────────────────────────────────────── */

test("sin token configurado, el estado explica cómo sacarlo", async () => {
  delete process.env.IG_TOKEN;

  const e = await instagram.estado();
  assert.equal(e.activo, false);
  assert.match(e.motivo, /developers\.facebook\.com/);
  // Lo que más miedo da de esta configuración es la revisión de Meta, y
  // el mensaje tiene que decir que no hace falta.
  assert.match(e.motivo, /No hace falta página de Facebook ni revisión/);
});

test("sin token configurado, publicar se niega en vez de explotar", async () => {
  delete process.env.IG_TOKEN;
  await assert.rejects(() => instagram.publicar({ caption: "hola" }, ["http://x/1.png"]));
});

/* ── 2 · Una placa ─────────────────────────────────────────────── */

test("una placa: cuota, contenedor y publicación, en ese orden", async () => {
  const r = await instagram.publicar({ caption: "Un copy." }, ["http://x/1.png"]);

  assert.deepEqual(rutasDe(), [
    `GET /${CUENTA}/content_publishing_limit`,
    `POST /${CUENTA}/media`,
    `POST /${CUENTA}/media_publish`,
    "GET /publicacion-1",
  ]);

  const contenedor = llamadas[1].parametros;
  assert.equal(contenedor.image_url, "http://x/1.png");
  assert.equal(contenedor.caption, "Un copy.");
  // Una sola imagen no es un ítem de carrusel.
  assert.equal(contenedor.is_carousel_item, undefined);

  assert.equal(llamadas[2].parametros.creation_id, "contenedor-1");
  assert.equal(r.id, "publicacion-1");
  assert.equal(r.permalink, "https://www.instagram.com/p/ABC123/");
});

/* ── 3 · Un carrusel ───────────────────────────────────────────── */

test("un carrusel: un contenedor por imagen y uno que los agrupa, en orden", async () => {
  const urls = ["http://x/1.png", "http://x/2.png", "http://x/3.png"];
  await instagram.publicar({ caption: "Carrusel." }, urls);

  const media = llamadas.filter((l) => l.ruta === `/${CUENTA}/media`);
  assert.equal(media.length, 4, "tres hijos más el contenedor del carrusel");

  // El orden de las imágenes es el que va a ver quien deslice: importa.
  assert.deepEqual(media.slice(0, 3).map((l) => l.parametros.image_url), urls);
  for (const hijo of media.slice(0, 3)) {
    assert.equal(hijo.parametros.is_carousel_item, "true");
    assert.equal(hijo.parametros.caption, undefined, "el copy va una sola vez, en el padre");
  }

  const padre = media[3].parametros;
  assert.equal(padre.media_type, "CAROUSEL");
  assert.equal(padre.children, "contenedor-1,contenedor-2,contenedor-3");
  assert.equal(padre.caption, "Carrusel.");
  assert.equal(llamadas.at(-2).parametros.creation_id, "contenedor-4");
});

test("más de diez imágenes no es un carrusel válido y se avisa antes de llamar a Meta", async () => {
  const urls = Array.from({ length: 11 }, (_, i) => `http://x/${i}.png`);
  await assert.rejects(
    () => instagram.publicar({ caption: "x" }, urls),
    /hasta 10 imágenes/
  );
  assert.equal(llamadas.length, 0, "ni siquiera consultó la cuota");
});

/* ── 4 · La cuota ──────────────────────────────────────────────── */

test("con la cuota agotada avisa en castellano en vez de fallar con un error de Meta", async () => {
  usadas = 50;
  await assert.rejects(
    () => instagram.publicar({ caption: "x" }, ["http://x/1.png"]),
    /no deja publicar más por ahora/
  );
  assert.deepEqual(rutasDe(), [`GET /${CUENTA}/content_publishing_limit`]);
});

test("cuotaRestante devuelve lo que queda", async () => {
  usadas = 12;
  assert.deepEqual(await instagram.cuotaRestante(), { tope: 50, usadas: 12, quedan: 38 });
});

/* ── 5 · El token ──────────────────────────────────────────────── */

test("el primer refresco guarda el token nuevo y su vencimiento", async () => {
  const r = await instagram.refrescarToken();
  assert.equal(r.refrescado, true);

  const guardado = JSON.parse(await fs.readFile(process.env.IG_ARCHIVO, "utf8"));
  assert.equal(guardado.token, "token-refrescado");
  assert.equal(guardado.semilla, "token-semilla");

  const dias = Math.round((new Date(guardado.hasta) - new Date(guardado.desde)) / 86400000);
  assert.equal(dias, 60);

  // Y el estado ya lo cuenta, que es lo que ve el panel.
  const e = await instagram.estado();
  assert.equal(e.activo, true);
  assert.equal(e.diasRestantes, 59);
});

test("un token de menos de 24 horas no se refresca: Meta no lo permite", async () => {
  await instagram.refrescarToken();
  llamadas = [];

  const r = await instagram.refrescarToken();
  assert.equal(r.refrescado, false);
  assert.match(r.motivo, /24 horas/);
  assert.equal(llamadas.length, 0, "no molestamos a Meta si ya sabemos la respuesta");
});

test("si cambiás el token del .env a mano, el guardado deja de valer", async () => {
  await instagram.refrescarToken();
  process.env.IG_TOKEN = "token-nuevo-a-mano";

  // El guardado quedó atado a la semilla vieja, así que arranca de cero
  // y sí se puede refrescar aunque el archivo diga que es de recién.
  llamadas = [];
  const r = await instagram.refrescarToken();
  assert.equal(r.refrescado, true);
  assert.equal(llamadas[0].parametros.access_token, "token-nuevo-a-mano");
});

test("un token vencido no se refresca solo: hay que sacar uno nuevo", async () => {
  const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
  await fs.writeFile(process.env.IG_ARCHIVO, JSON.stringify({
    semilla: "token-semilla",
    token: "token-viejo",
    desde: hace(65.5),
    hasta: hace(5.5),
  }), "utf8");

  const e = await instagram.estado();
  assert.equal(e.activo, false);
  assert.match(e.motivo, /se venció hace 5 días/);
  assert.match(e.motivo, /Generá uno nuevo/);
});

test("a menos de diez días de vencer, el estado avisa", async () => {
  await fs.writeFile(process.env.IG_ARCHIVO, JSON.stringify({
    semilla: "token-semilla",
    token: "token-por-vencer",
    desde: new Date(Date.now() - 55.5 * 86400000).toISOString(),
    hasta: new Date(Date.now() + 4.5 * 86400000).toISOString(),
  }), "utf8");

  const e = await instagram.estado();
  assert.equal(e.activo, true);
  assert.match(e.aviso, /vence en 4 días/);
});

/* ── 6 · La vitrina ────────────────────────────────────────────── */

test("la vitrina sube una imagen y la borra cuando se le pide", async () => {
  const archivo = path.join(tmp, "placa.png");
  await fs.writeFile(archivo, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const s = await vitrina.subir(archivo);
  assert.match(s.url, /\/i\/0{31}\d$/);
  assert.equal(await cuantasQuedanEnLaBandeja(), 1);

  await vitrina.borrar([s.id]);
  assert.equal(await cuantasQuedanEnLaBandeja(), 0);
});

test("sin bandeja desplegada, la vitrina dice qué falta hacer", async () => {
  const url = process.env.BANDEJA_URL;
  delete process.env.BANDEJA_URL;
  try {
    const e = vitrina.estado();
    assert.equal(e.activo, false);
    assert.match(e.motivo, /bandeja desplegada/);
  } finally {
    process.env.BANDEJA_URL = url;
  }
});

/* ── 7 · La pieza completa ─────────────────────────────────────── */

const creadas = [];

/** Una pieza en salida/, con imágenes de verdad para que la vitrina lea. */
async function crearPieza(estado, cuantasImagenes = 1, extra = {}) {
  const carpeta = `2026-09-04-prueba-ig-${creadas.length}`;
  const destino = path.join(RUTAS.salida, carpeta);
  await fs.mkdir(destino, { recursive: true });
  creadas.push(destino);

  const imagenes = [];
  for (let i = 1; i <= cuantasImagenes; i++) {
    const nombre = `0${i}.png`;
    imagenes.push(nombre);
    await fs.writeFile(path.join(destino, nombre), Buffer.from([0x89, 0x50, 0x4e, 0x47, i]));
  }

  await fs.writeFile(path.join(destino, "ficha.json"), JSON.stringify({
    fecha: "2026-09-04",
    tema: "prueba-instagram",
    titular: "Titular de prueba",
    formato: cuantasImagenes > 1 ? "carrusel" : "placa",
    plantilla: "dato",
    audiencia: "inversor",
    estado,
    imagenes,
    faltantes: [],
    fuentes: ["prueba"],
    ...extra,
  }, null, 2), "utf8");
  await fs.writeFile(path.join(destino, "copy.txt"), "El copy de la pieza.\n", "utf8");
  return carpeta;
}

async function limpiarPiezas() {
  while (creadas.length) await fs.rm(creadas.pop(), { recursive: true, force: true }).catch(() => {});
}

test("una pieza en borrador no se publica: primero hay que aprobarla", async () => {
  const c = await crearPieza("borrador");
  try {
    const r = await publicarEnInstagram(c);
    assert.equal(r.publicada, false);
    assert.match(r.motivo, /aprobarla/);
    assert.equal(llamadas.length, 0);
  } finally { await limpiarPiezas(); }
});

test("una pieza que ya salió por Instagram no se publica dos veces", async () => {
  const c = await crearPieza("publicada", 1, {
    instagram: { id: "publicacion-vieja", permalink: "https://x" },
  });
  try {
    const r = await publicarEnInstagram(c);
    assert.equal(r.publicada, false);
    assert.match(r.motivo, /ya salió en Instagram/);
    assert.equal(r.id, "publicacion-vieja", "y dice cuál fue");
    assert.equal(llamadas.length, 0);
  } finally { await limpiarPiezas(); }
});

test("una pieza marcada como publicada a mano tampoco se publica sola", async () => {
  // Sin registro de red no sabemos adónde la subiste, y repetirla en el
  // mismo lugar es peor que negarse.
  const c = await crearPieza("publicada");
  try {
    const r = await publicarEnInstagram(c);
    assert.equal(r.publicada, false);
    assert.match(r.motivo, /publicada a mano/);
    assert.equal(llamadas.length, 0);
  } finally { await limpiarPiezas(); }
});

test("una pieza aprobada sale, queda anotada y la vitrina queda vacía", async () => {
  const c = await crearPieza("aprobada", 3);
  const antes = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));

  try {
    const r = await publicarEnInstagram(c);
    assert.equal(r.publicada, true);
    assert.equal(r.permalink, "https://www.instagram.com/p/ABC123/");

    // Las tres imágenes se subieron a la bandeja...
    const subidas = llamadas.filter((l) => l.ruta === `/${CUENTA}/media` && l.parametros.is_carousel_item);
    assert.equal(subidas.length, 3);
    // ...y ninguna quedó dando vueltas después de publicar.
    assert.equal(await cuantasQuedanEnLaBandeja(), 0);

    const ficha = JSON.parse(await fs.readFile(path.join(RUTAS.salida, c, "ficha.json"), "utf8"));
    assert.equal(ficha.estado, "publicada");
    assert.equal(ficha.instagram.id, "publicacion-1");

    const despues = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));
    assert.equal(despues.publicaciones.length, antes.publicaciones.length + 1);
  } finally {
    await limpiarPiezas();
    // El historial es un archivo del proyecto: se restaura pase lo que pase.
    await fs.writeFile(RUTAS.historial, JSON.stringify(antes, null, 2) + "\n", "utf8");
  }
});

test("si Meta corta a mitad de un carrusel, la pieza NO queda como publicada", async () => {
  const c = await crearPieza("aprobada", 3);
  const antes = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));

  // Los dos primeros contenedores pasan; el tercero falla.
  romperEn = { ruta: "/media", despues: 2, mensaje: "Media upload failed." };

  try {
    await assert.rejects(() => publicarEnInstagram(c), /Media upload failed/);

    // Lo que importa: la pieza sigue aprobada, así que se puede reintentar.
    const ficha = JSON.parse(await fs.readFile(path.join(RUTAS.salida, c, "ficha.json"), "utf8"));
    assert.equal(ficha.estado, "aprobada");
    assert.equal(ficha.instagram, undefined);

    const despues = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));
    assert.equal(despues.publicaciones.length, antes.publicaciones.length);

    // Y las imágenes que alcanzaron a subirse no se quedan publicadas
    // en internet esperando la hora de caducar.
    assert.equal(await cuantasQuedanEnLaBandeja(), 0);
  } finally {
    await limpiarPiezas();
    await fs.writeFile(RUTAS.historial, JSON.stringify(antes, null, 2) + "\n", "utf8");
  }
});

test("sin bandeja desplegada, la pieza aprobada avisa y no llama a Meta", async () => {
  const c = await crearPieza("aprobada");
  const url = process.env.BANDEJA_URL;
  delete process.env.BANDEJA_URL;
  try {
    const r = await publicarEnInstagram(c);
    assert.equal(r.publicada, false);
    assert.match(r.motivo, /bandeja desplegada/);
    assert.equal(llamadas.length, 0);
  } finally {
    process.env.BANDEJA_URL = url;
    await limpiarPiezas();
  }
});

test("publicar en Instagram no está entre las herramientas que ve el modelo", async () => {
  const { DEFINICIONES } = await import("../servidor/herramientas.mjs");
  const nombres = DEFINICIONES.map((d) => d.name);
  // Mandar algo al mundo es una decisión de una persona: HERALDO arma la
  // pieza, el botón lo apretás vos.
  assert.equal(nombres.includes("publicar_en_instagram"), false);
  assert.equal(nombres.includes("aprobar_pieza"), false);
});
