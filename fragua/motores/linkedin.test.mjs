/* Pruebas de la publicación en LinkedIn.

   No hay credenciales ni salida a api.linkedin.com desde acá, así que
   estas pruebas levantan un servidor que responde como la API
   documentada: el alta de archivo en tres pasos, /rest/posts con sus
   cabeceras, y el intercambio de tokens de OAuth.

   Lo que se prueba es nuestro lado. Y sobre todo dos cosas que en
   producción salen caras:

     · Que el autor sea un dato y no algo escrito en el código, para
       que el día que LinkedIn apruebe la página no haya que rehacer
       nada.
     · Que si LinkedIn corta a mitad de camino la pieza NO quede
       marcada como publicada.

   node --test motores/linkedin.test.mjs */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { RUTAS } from "../nucleo/marca.mjs";
import * as linkedin from "./linkedin.mjs";
import { publicarEnLinkedin } from "../nucleo/piezas.mjs";
import { buscarNavegador } from "../nucleo/render.mjs";

const PAGINA = "urn:li:organization:7654321";
const PERFIL = "urn:li:person:AbC123";

let servidor, tmp;
let llamadas = [];
let subidos = [];
let romper = null;
let refrescoDisponible = true;

function levantar(manejar) {
  return new Promise((listo) => {
    const s = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://local");
      const trozos = [];
      for await (const t of req) trozos.push(t);
      const r = await manejar(req.method, url.pathname, Buffer.concat(trozos), req.headers, url);
      res.writeHead(r.codigo || 200, r.cabeceras || { "content-type": "application/json" });
      res.end(typeof r.cuerpo === "string" ? r.cuerpo : JSON.stringify(r.cuerpo ?? {}));
    });
    s.listen(0, "127.0.0.1", () => listo(s));
  });
}

const base = () => `http://127.0.0.1:${servidor.address().port}`;

before(async () => {
  servidor = await levantar(async (metodo, ruta, cuerpo, cabeceras, url) => {
    const cuerpoJson = (() => { try { return JSON.parse(cuerpo.toString()); } catch { return null; } })();
    llamadas.push({ metodo, ruta, cuerpo: cuerpoJson, cabeceras, accion: url.searchParams.get("action") });

    if (romper && ruta.includes(romper.ruta)) {
      return { codigo: 400, cuerpo: { message: romper.mensaje } };
    }

    /* OAuth */
    if (ruta === "/oauth/v2/accessToken") {
      const campos = Object.fromEntries(new URLSearchParams(cuerpo.toString()));
      if (campos.grant_type === "authorization_code" && campos.code !== "codigo-bueno") {
        return { codigo: 400, cuerpo: { error_description: "invalid authorization code" } };
      }
      return {
        cuerpo: {
          access_token: `token-${campos.grant_type}`,
          expires_in: 60 * 86400,
          ...(refrescoDisponible ? { refresh_token: "refresco-1" } : {}),
        },
      };
    }

    /* Alta de archivos */
    if ((ruta === "/rest/images" || ruta === "/rest/documents") && url.searchParams.get("action") === "initializeUpload") {
      const n = subidos.length + 1;
      const tipo = ruta.endsWith("images") ? "image" : "document";
      return {
        cuerpo: {
          value: {
            uploadUrl: `${base()}/subir/${tipo}-${n}`,
            [tipo]: `urn:li:${tipo}:ASSET${n}`,
          },
        },
      };
    }

    if (metodo === "PUT" && ruta.startsWith("/subir/")) {
      subidos.push({ nombre: ruta.slice("/subir/".length), bytes: cuerpo.length });
      return { codigo: 201, cuerpo: {} };
    }

    /* Publicar */
    if (ruta === "/rest/posts" && metodo === "POST") {
      return {
        codigo: 201,
        cabeceras: { "content-type": "application/json", "x-restli-id": "urn:li:share:999" },
        cuerpo: {},
      };
    }

    return { codigo: 404, cuerpo: { message: `Ruta desconocida: ${ruta}` } };
  });

  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fragua-li-"));

  process.env.LINKEDIN_API = base();
  process.env.LINKEDIN_LOGIN = base();
  process.env.LINKEDIN_ARCHIVO = path.join(tmp, "linkedin.json");
  process.env.LINKEDIN_CLIENT_ID = "id-de-prueba";
  process.env.LINKEDIN_CLIENT_SECRET = "secreto-de-prueba";
  process.env.LINKEDIN_AUTOR = PAGINA;
});

after(async () => {
  servidor.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

beforeEach(async () => {
  llamadas = [];
  subidos = [];
  romper = null;
  refrescoDisponible = true;
  process.env.LINKEDIN_AUTOR = PAGINA;
  process.env.LINKEDIN_CLIENT_ID = "id-de-prueba";
  await fs.rm(process.env.LINKEDIN_ARCHIVO, { force: true });
});

/** Deja un token vivo, como si ya hubieras autorizado. */
async function yaAutorizado({ dias = 45, refresco = "refresco-1" } = {}) {
  await fs.writeFile(process.env.LINKEDIN_ARCHIVO, JSON.stringify({
    autor: process.env.LINKEDIN_AUTOR,
    token: "token-vivo",
    refresco,
    desde: new Date(Date.now() - (60 - dias) * 86400000).toISOString(),
    hasta: new Date(Date.now() + dias * 86400000).toISOString(),
  }), "utf8");
}

/* ── Sin configurar ────────────────────────────────────────────── */

test("sin configurar, el estado explica los dos caminos y cuál tarda", async () => {
  delete process.env.LINKEDIN_CLIENT_ID;

  const e = await linkedin.estado();
  assert.equal(e.activo, false);
  assert.match(e.motivo, /developers\.linkedin\.com/);
  // Lo que más importa que diga: que la página tarda y el perfil no.
  assert.match(e.motivo, /Community\s+Management API/);
  assert.match(e.motivo, /perfil personal/);
});

test("un autor mal escrito se avisa antes de intentar nada", async () => {
  process.env.LINKEDIN_AUTOR = "7654321";
  const e = await linkedin.estado();
  assert.equal(e.activo, false);
  assert.match(e.motivo, /URN completo/);
  assert.match(e.motivo, /urn:li:organization/);
});

test("sin autorizar, pide conectar en vez de fallar", async () => {
  const e = await linkedin.estado();
  assert.equal(e.activo, false);
  assert.equal(e.necesitaConectar, true);
  assert.match(e.motivo, /Conectar/);
});

/* ── El autor es un dato, no código ────────────────────────────── */

test("el tipo de autor se dice en castellano", () => {
  assert.equal(linkedin.tipoDeAutor(PAGINA), "página de empresa");
  assert.equal(linkedin.tipoDeAutor(PERFIL), "perfil personal");
});

test("los permisos que se piden dependen del autor configurado", async () => {
  // Pedir el permiso de organización con la app sin aprobar hace que
  // LinkedIn rechace la autorización entera, así que se pide el que va.
  const c1 = await linkedin.conectar();
  assert.match(c1.permisos, /w_organization_social/);
  assert.ok(!c1.permisos.includes("w_member_social"));

  process.env.LINKEDIN_AUTOR = PERFIL;
  const c2 = await linkedin.conectar();
  assert.match(c2.permisos, /w_member_social/);
  assert.ok(!c2.permisos.includes("w_organization_social"));
});

test("cambiar de la página al perfil no cambia ni una línea de código", async () => {
  const salidas = [];

  for (const autor of [PAGINA, PERFIL]) {
    process.env.LINKEDIN_AUTOR = autor;
    llamadas = [];
    subidos = [];
    await yaAutorizado();

    await linkedin.publicar({ texto: "Un texto." }, { imagenes: [await unaImagen()] });

    const post = llamadas.find((l) => l.ruta === "/rest/posts");
    const alta = llamadas.find((l) => l.accion === "initializeUpload");
    salidas.push({ autorDelPost: post.cuerpo.author, duenoDelAlta: alta.cuerpo.initializeUploadRequest.owner });
  }

  assert.deepEqual(salidas, [
    { autorDelPost: PAGINA, duenoDelAlta: PAGINA },
    { autorDelPost: PERFIL, duenoDelAlta: PERFIL },
  ]);
});

/* ── La autorización ───────────────────────────────────────────── */

test("la vuelta del consentimiento tiene que coincidir con el pedido", async () => {
  await linkedin.conectar();
  await assert.rejects(
    () => linkedin.atender({ code: "codigo-bueno", state: "otro-testigo" }),
    /no coincide con el pedido/
  );
});

test("conectar y volver deja el acceso guardado con su vencimiento", async () => {
  const c = await linkedin.conectar();
  const testigo = new URL(c.url).searchParams.get("state");

  assert.match(c.url, /\/oauth\/v2\/authorization/);
  assert.equal(new URL(c.url).searchParams.get("redirect_uri"), linkedin.RETORNO());

  await linkedin.atender({ code: "codigo-bueno", state: testigo });

  const e = await linkedin.estado();
  assert.equal(e.activo, true);
  assert.equal(e.tipo, "página de empresa");
  assert.equal(e.diasRestantes, 59);
  assert.equal(e.puedeRefrescar, true);
});

test("un código inválido se explica, no explota", async () => {
  const c = await linkedin.conectar();
  const testigo = new URL(c.url).searchParams.get("state");
  await assert.rejects(
    () => linkedin.atender({ code: "codigo-malo", state: testigo }),
    /invalid authorization code/
  );
});

/* ── El refresco, que no todas las apps tienen ─────────────────── */

test("con token de refresco, se renueva solo", async () => {
  await yaAutorizado({ dias: 5 });
  const r = await linkedin.refrescarToken();
  assert.equal(r.refrescado, true);

  const guardado = JSON.parse(await fs.readFile(process.env.LINKEDIN_ARCHIVO, "utf8"));
  assert.equal(guardado.token, "token-refresh_token");
});

test("sin token de refresco no es un error: es «hay que reconectar»", async () => {
  // Es el caso de las apps que LinkedIn no aprobó para la plataforma de
  // marketing, y no se sabe cuál sos hasta que te contestan.
  await yaAutorizado({ dias: 5, refresco: null });

  const r = await linkedin.refrescarToken();
  assert.equal(r.refrescado, false);
  assert.match(r.motivo, /reconectar a mano/);
  assert.equal(llamadas.length, 0, "no molestamos a LinkedIn si ya sabemos que no hay refresco");

  // Y el aviso del panel dice la verdad sobre lo que va a pasar.
  const e = await linkedin.estado();
  assert.equal(e.puedeRefrescar, false);
  assert.match(e.aviso, /no se renueva sola/);
});

test("un acceso de recién no se refresca", async () => {
  // 60 días restantes es un acceso recién sacado: LinkedIn no lo
  // refresca antes de las 24 horas y no tiene sentido pedírselo.
  await yaAutorizado({ dias: 60 });
  const r = await linkedin.refrescarToken();
  assert.equal(r.refrescado, false);
  assert.match(r.motivo, /de recién/);
});

test("un acceso vencido pide reconectar y dice hace cuánto", async () => {
  await fs.writeFile(process.env.LINKEDIN_ARCHIVO, JSON.stringify({
    token: "viejo", refresco: null,
    desde: new Date(Date.now() - 90 * 86400000).toISOString(),
    hasta: new Date(Date.now() - 3.5 * 86400000).toISOString(),
  }), "utf8");

  const e = await linkedin.estado();
  assert.equal(e.activo, false);
  assert.equal(e.necesitaConectar, true);
  assert.match(e.motivo, /venció hace 3 días/);
});

/* ── Subir y publicar ──────────────────────────────────────────── */

async function unaImagen(n = 1) {
  const p = path.join(tmp, `placa-${n}.png`);
  await fs.writeFile(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, n]));
  return p;
}

test("una imagen sola: alta en tres pasos y publicación", async () => {
  await yaAutorizado();
  const r = await linkedin.publicar({ texto: "Un copy.", titulo: "T" }, { imagenes: [await unaImagen()] });

  assert.deepEqual(llamadas.map((l) => `${l.metodo} ${l.ruta}`), [
    "POST /rest/images",
    "PUT /subir/image-1",
    "POST /rest/posts",
  ]);

  assert.equal(subidos.length, 1);
  assert.equal(subidos[0].bytes, 5, "los bytes del archivo van tal cual");

  const post = llamadas.at(-1);
  assert.equal(post.cuerpo.content.media.id, "urn:li:image:ASSET1");
  assert.equal(post.cuerpo.commentary, "Un copy.");
  assert.equal(post.cuerpo.lifecycleState, "PUBLISHED");
  assert.equal(post.cuerpo.visibility, "PUBLIC");

  // Las dos cabeceras que LinkedIn exige en cada llamada.
  assert.match(post.cabeceras["linkedin-version"], /^\d{6}$/);
  assert.equal(post.cabeceras["x-restli-protocol-version"], "2.0.0");

  assert.equal(r.id, "urn:li:share:999", "el id llega en una cabecera, no en el cuerpo");
  assert.match(r.permalink, /linkedin\.com\/feed\/update/);
});

test("varias imágenes sueltas van como multiImage, en orden", async () => {
  await yaAutorizado();
  const archivos = [await unaImagen(1), await unaImagen(2), await unaImagen(3)];
  await linkedin.publicar({ texto: "x" }, { imagenes: archivos });

  assert.equal(subidos.length, 3);
  const post = llamadas.at(-1);
  assert.deepEqual(post.cuerpo.content.multiImage.images.map((i) => i.id),
    ["urn:li:image:ASSET1", "urn:li:image:ASSET2", "urn:li:image:ASSET3"]);
});

test("un documento va por /rest/documents y lleva título", async () => {
  await yaAutorizado();
  const pdf = path.join(tmp, "carrusel.pdf");
  await fs.writeFile(pdf, Buffer.from("%PDF-1.4 falso"));

  await linkedin.publicar({ texto: "x", titulo: "El margen bruto" }, { documento: pdf });

  assert.deepEqual(llamadas.map((l) => `${l.metodo} ${l.ruta}`), [
    "POST /rest/documents",
    "PUT /subir/document-1",
    "POST /rest/posts",
  ]);
  const post = llamadas.at(-1);
  assert.equal(post.cuerpo.content.media.id, "urn:li:document:ASSET1");
  assert.equal(post.cuerpo.content.media.title, "El margen bruto");
});

test("sin texto no se publica: una publicación muda no dice nada", async () => {
  await yaAutorizado();
  const img = await unaImagen();
  await assert.rejects(
    () => linkedin.publicar({ texto: "   " }, { imagenes: [img] }),
    /sin texto/
  );
  assert.equal(llamadas.length, 0);
});

/* ── La pieza completa ─────────────────────────────────────────── */

const creadas = [];

async function crearPieza(estado, { formato = "placa", placas = 1, extra = {} } = {}) {
  const carpeta = `2026-09-05-prueba-li-${creadas.length}-${process.pid}`;
  const destino = path.join(RUTAS.salida, carpeta);
  await fs.mkdir(destino, { recursive: true });
  creadas.push(destino);

  const imagenes = [];
  const cuerpos = [];
  for (let i = 1; i <= placas; i++) {
    imagenes.push(`0${i}.png`);
    cuerpos.push({ titulo: `Placa ${i}`, texto: `Texto de la placa ${i}.` });
    await fs.writeFile(path.join(destino, `0${i}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47, i]));
  }

  await fs.writeFile(path.join(destino, "ficha.json"), JSON.stringify({
    fecha: "2026-09-05", tema: `prueba-li-${creadas.length}`, titular: "Titular de prueba",
    formato, plantilla: formato === "carrusel" ? "carrusel" : "cita",
    audiencia: "inversor", estado, imagenes, placas: cuerpos,
    faltantes: [], fuentes: ["prueba"], ...extra,
  }, null, 2), "utf8");
  await fs.writeFile(path.join(destino, "copy.txt"), "El copy de Instagram.\n#nogal #agro\n", "utf8");
  return carpeta;
}

async function limpiar() {
  while (creadas.length) await fs.rm(creadas.pop(), { recursive: true, force: true }).catch(() => {});
}

test("una pieza en borrador no se publica", async () => {
  await yaAutorizado();
  const c = await crearPieza("borrador");
  try {
    const r = await publicarEnLinkedin(c);
    assert.equal(r.publicada, false);
    assert.match(r.motivo, /aprobarla/);
    assert.equal(llamadas.length, 0);
  } finally { await limpiar(); }
});

test("una pieza que ya salió en Instagram sí puede irse a LinkedIn", async () => {
  // Es la razón de que el candado mire la red y no el estado.
  await yaAutorizado();
  const c = await crearPieza("publicada", {
    extra: { instagram: { id: "ig-1", permalink: "https://instagram.com/p/x" } },
  });
  const antes = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));

  try {
    const r = await publicarEnLinkedin(c);
    assert.equal(r.publicada, true);

    const ficha = JSON.parse(await fs.readFile(path.join(RUTAS.salida, c, "ficha.json"), "utf8"));
    assert.equal(ficha.instagram.id, "ig-1", "el registro de Instagram no se pisa");
    assert.equal(ficha.linkedin.id, "urn:li:share:999");

    // Al historial va una sola vez: ya estaba anotada por Instagram.
    const despues = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));
    assert.equal(despues.publicaciones.length, antes.publicaciones.length);
  } finally {
    await limpiar();
    await fs.writeFile(RUTAS.historial, JSON.stringify(antes, null, 2) + "\n", "utf8");
  }
});

test("una pieza que ya salió en LinkedIn no se publica dos veces", async () => {
  await yaAutorizado();
  const c = await crearPieza("publicada", { extra: { linkedin: { id: "li-viejo" } } });
  try {
    const r = await publicarEnLinkedin(c);
    assert.equal(r.publicada, false);
    assert.match(r.motivo, /ya salió en LinkedIn/);
    assert.equal(llamadas.length, 0);
  } finally { await limpiar(); }
});

test("un carrusel se manda como PDF, no como imágenes", async (t) => {
  if (!(await buscarNavegador())) { t.skip("sin navegador no hay PDF"); return; }

  await yaAutorizado();
  const c = await crearPieza("aprobada", { formato: "carrusel", placas: 3 });
  const antes = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));

  try {
    const r = await publicarEnLinkedin(c);
    assert.equal(r.publicada, true);
    assert.equal(r.formato, "documento");

    // Un solo alta, de documento, y ninguna de imagen.
    assert.deepEqual(llamadas.filter((l) => l.accion === "initializeUpload").map((l) => l.ruta),
      ["/rest/documents"]);

    // Y el PDF que se subió es un PDF de verdad, con las tres placas.
    const pdf = await fs.readFile(path.join(RUTAS.salida, c, "carrusel.pdf"));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.equal((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length, 3);

    const ficha = JSON.parse(await fs.readFile(path.join(RUTAS.salida, c, "ficha.json"), "utf8"));
    assert.equal(ficha.estado, "publicada");
    assert.equal(ficha.linkedin.permalink, r.permalink);
  } finally {
    await limpiar();
    await fs.writeFile(RUTAS.historial, JSON.stringify(antes, null, 2) + "\n", "utf8");
  }
});

test("usa el copy de LinkedIn si lo adaptaste", async () => {
  await yaAutorizado();
  const c = await crearPieza("aprobada");
  const antes = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));

  try {
    await fs.writeFile(path.join(RUTAS.salida, c, "copy-linkedin.txt"),
      "El copy de LinkedIn, con tres hashtags.\n#factibilidad\n", "utf8");

    await publicarEnLinkedin(c);
    assert.match(llamadas.at(-1).cuerpo.commentary, /copy de LinkedIn/);
  } finally {
    await limpiar();
    await fs.writeFile(RUTAS.historial, JSON.stringify(antes, null, 2) + "\n", "utf8");
  }
});

test("si LinkedIn corta a mitad de camino, la pieza NO queda publicada", async () => {
  await yaAutorizado();
  const c = await crearPieza("aprobada");
  const antes = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));

  // La imagen sube bien; falla al crear la publicación.
  romper = { ruta: "/rest/posts", mensaje: "Internal error" };

  try {
    await assert.rejects(() => publicarEnLinkedin(c), /Internal error/);

    const ficha = JSON.parse(await fs.readFile(path.join(RUTAS.salida, c, "ficha.json"), "utf8"));
    assert.equal(ficha.estado, "aprobada", "sigue aprobada, así que se puede reintentar");
    assert.equal(ficha.linkedin, undefined);

    const despues = JSON.parse(await fs.readFile(RUTAS.historial, "utf8"));
    assert.equal(despues.publicaciones.length, antes.publicaciones.length);
  } finally {
    await limpiar();
    await fs.writeFile(RUTAS.historial, JSON.stringify(antes, null, 2) + "\n", "utf8");
  }
});

test("publicar en LinkedIn no está entre las herramientas que ve el modelo", async () => {
  const { DEFINICIONES } = await import("../servidor/herramientas.mjs");
  const nombres = DEFINICIONES.map((d) => d.name);
  assert.equal(nombres.includes("publicar_en_linkedin"), false);
  assert.equal(nombres.includes("conectar_linkedin"), false);
});
