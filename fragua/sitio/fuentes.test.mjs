/* Pruebas del descargador de tipografías.

   Google Fonts está bloqueado desde el entorno donde se escribió esto,
   así que las pruebas levantan un servidor local que responde como la
   API css2 documentada: un bloque @font-face por peso Y por
   subconjunto, cada uno con su unicode-range.

   Eso es justamente lo que hay que probar: que de los cinco bloques
   que Google manda por peso nos quedemos con el latino y tiremos el
   cirílico, el griego y el vietnamita. Sin ese filtro el visitante
   bajaría cinco veces más de lo que va a leer.

   node --test sitio/fuentes.test.mjs */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

import { FUENTES, RUTAS } from "../nucleo/marca.mjs";
import { pedidos, bloquesLatinos, faltantes, traer } from "./fuentes.mjs";

/* Los rangos que Google manda de verdad, abreviados. */
const RANGOS = {
  cyrillic:      "U+0301, U+0400-045F, U+0490-0491",
  greek:         "U+0370-0377, U+037A-037F",
  vietnamese:    "U+0102-0103, U+1EA0-1EF9",
  "latin-ext":   "U+0100-02BA, U+02BD-02C5",
  latin:         "U+0000-00FF, U+0131, U+0152-0153",
};

let servidor, pedidas, agente;

function bloque(familia, estilo, peso, subconjunto, base) {
  return `/* ${subconjunto} */
@font-face {
  font-family: '${familia}';
  font-style: ${estilo};
  font-weight: ${peso};
  font-display: swap;
  src: url(${base}/${familia.replace(/ /g, "")}-${estilo}-${peso}-${subconjunto}.woff2) format('woff2');
  unicode-range: ${RANGOS[subconjunto]};
}`;
}

before(async () => {
  servidor = await new Promise((listo) => {
    const s = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://local");

      if (url.pathname === "/css2") {
        pedidas.push(url.search);
        agente = req.headers["user-agent"];

        const base = `http://127.0.0.1:${s.address().port}/f`;
        const familia = url.searchParams.get("family").split(":")[0].replace(/\+/g, " ");
        const ejes = url.searchParams.get("family").split("@")[1].split(";");

        const css = ejes.flatMap((eje) => {
          const [a, b] = eje.split(",");
          const estilo = b === undefined ? "normal" : (a === "1" ? "italic" : "normal");
          const peso = b === undefined ? a : b;
          // Los cinco subconjuntos, como los manda Google.
          return Object.keys(RANGOS).map((sub) => bloque(familia, estilo, peso, sub, base));
        }).join("\n");

        res.writeHead(200, { "content-type": "text/css" });
        return res.end(css);
      }

      if (url.pathname.startsWith("/f/")) {
        // Un woff2 de mentira, pero con la firma real, para distinguirlos.
        res.writeHead(200, { "content-type": "font/woff2" });
        return res.end(Buffer.concat([Buffer.from("wOF2"), Buffer.from(url.pathname)]));
      }

      res.writeHead(404).end();
    });
    s.listen(0, "127.0.0.1", () => listo(s));
  });

  process.env.FRAGUA_FUENTES_API = `http://127.0.0.1:${servidor.address().port}/css2`;
});

after(() => servidor.close());

beforeEach(() => { pedidas = []; agente = null; });

/* ── Lo que se le pide a Google ────────────────────────────────── */

test("la consulta sale de FUENTES, no de una lista escrita aparte", () => {
  const p = pedidos();
  const porFamilia = Object.fromEntries(p.map((x) => [x.familia, x.consulta]));

  // Con itálicas, Google exige el eje ital y los valores ordenados.
  assert.equal(porFamilia["IBM Plex Sans"], "family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400");
  // Sin itálicas, sólo el peso.
  assert.equal(porFamilia["IBM Plex Mono"], "family=IBM+Plex+Mono:wght@500;600");
  assert.equal(porFamilia["Rajdhani"], "family=Rajdhani:wght@600;700");

  // Una familia por pedido: son tres llamadas, no una por cara.
  assert.equal(p.length, 3);
});

/* ── El filtro de subconjuntos ─────────────────────────────────── */

test("de los cinco subconjuntos que manda Google se guardan los latinos", () => {
  const css = Object.keys(RANGOS)
    .map((sub) => bloque("IBM Plex Sans", "normal", 400, sub, "https://x"))
    .join("\n");

  const b = bloquesLatinos(css);
  assert.equal(b.length, 2, "latin y latin-ext, nada más");
  assert.ok(b.every((x) => /latin/.test(x.url)));
  assert.ok(!b.some((x) => /cyrillic|greek|vietnamese/.test(x.url)));
});

test("lee bien familia, peso y estilo de cada bloque", () => {
  const b = bloquesLatinos(bloque("IBM Plex Sans", "italic", 400, "latin", "https://x"));
  assert.equal(b.length, 1);
  assert.equal(b[0].familia, "IBM Plex Sans");
  assert.equal(b[0].estilo, "italic");
  assert.equal(b[0].peso, 400);
});

test("un bloque sin woff2 se saltea en vez de romper", () => {
  const css = `@font-face { font-family: 'X'; font-weight: 400;
    src: url(https://x/a.ttf) format('truetype'); unicode-range: ${RANGOS.latin}; }`;
  assert.deepEqual(bloquesLatinos(css), []);
});

/* ── La descarga ───────────────────────────────────────────────── */

test("baja las ocho caras, una sola vez, y deja el LEEME de licencia", async () => {
  // Trabajamos sobre una carpeta aparte para no tocar public/fuentes/.
  const real = RUTAS.fuentes;
  const tmp = path.join(RUTAS.salida, `prueba-fuentes-${process.pid}`);
  RUTAS.fuentes = tmp;

  try {
    const r = await traer({ todas: true });

    assert.equal(r.bajadas.length, FUENTES.length);
    assert.deepEqual(r.sinEncontrar, [], "todas las caras tienen que aparecer");
    assert.equal(pedidas.length, 3, "una llamada por familia, no una por cara");

    // Sin un navegador en el User-Agent, Google devuelve ttf en vez de woff2.
    assert.match(agente, /Chrome/);

    for (const f of FUENTES) {
      const datos = await fs.readFile(path.join(tmp, f.archivo));
      assert.equal(datos.subarray(0, 4).toString(), "wOF2", `${f.archivo} no es un woff2`);
      // Y que a cada archivo le haya tocado SU cara, no la de al lado.
      assert.match(datos.toString(), new RegExp(`-${f.estilo}-${f.peso}-latin`),
        `${f.archivo} recibió el contenido de otra cara`);
    }

    const leeme = await fs.readFile(path.join(tmp, "LEEME.txt"), "utf8");
    assert.match(leeme, /SIL Open Font License 1\.1/);
    assert.match(leeme, /IBM Plex/);
  } finally {
    RUTAS.fuentes = real;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("lo que ya está en disco no se vuelve a bajar", async () => {
  const real = RUTAS.fuentes;
  const tmp = path.join(RUTAS.salida, `prueba-fuentes-2-${process.pid}`);
  RUTAS.fuentes = tmp;

  try {
    await fs.mkdir(tmp, { recursive: true });
    // Dejamos puestas todas menos una.
    for (const f of FUENTES.slice(1)) await fs.writeFile(path.join(tmp, f.archivo), "wOF2ya");

    const falta = await faltantes();
    assert.equal(falta.length, 1);
    assert.equal(falta[0].archivo, FUENTES[0].archivo);

    const r = await traer();
    assert.equal(r.bajadas.length, 1);
    assert.equal(r.yaEstaban, FUENTES.length - 1);
    assert.equal(pedidas.length, 1, "sólo se le pide a Google la familia que falta");

    // Y las que ya estaban quedaron como estaban.
    assert.equal(await fs.readFile(path.join(tmp, FUENTES[1].archivo), "utf8"), "wOF2ya");
  } finally {
    RUTAS.fuentes = real;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

/* ── El candado contra el rastreo ──────────────────────────────── */

test("la maqueta del sitio no le pide nada a Google", async () => {
  // Es la prueba que justifica todo este archivo: si alguien vuelve a
  // pegar un <link> de Google Fonts, esto lo frena antes de publicar.
  const maqueta = await fs.readFile(RUTAS.maqueta, "utf8");

  assert.ok(!maqueta.includes("fonts.googleapis.com"),
    "la maqueta volvió a pedirle la hoja de estilo a Google");
  assert.ok(!maqueta.includes("fonts.gstatic.com"),
    "la maqueta volvió a pedirle los archivos a Google");

  // Y que las declare ella misma.
  assert.match(maqueta, /@font-face/);
  assert.match(maqueta, /\/fuentes\/ibmplexsans-400\.woff2/);
});

test("cada cara declarada en FUENTES está declarada en la maqueta", async () => {
  const maqueta = await fs.readFile(RUTAS.maqueta, "utf8");
  for (const f of FUENTES) {
    // Rajdhani va en el sitio y en las placas; todas tienen que estar.
    assert.ok(maqueta.includes(`/fuentes/${f.archivo}`),
      `la maqueta no declara ${f.archivo}`);
  }
});
