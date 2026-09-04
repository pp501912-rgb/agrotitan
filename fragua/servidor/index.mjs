/* ═══════════════════════════════════════════════════════════════════
   SERVIDOR · el que sirve el panel y atiende al chat.

   Sobre node:http, sin ninguna dependencia. Escucha SÓLO en 127.0.0.1:
   nadie de tu red ni de internet puede llegarle.

   Arranque:  node servidor/index.mjs        (o doble clic en iniciar)
   ═══════════════════════════════════════════════════════════════════ */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { RUTAS, RAÍZ } from "../nucleo/marca.mjs";
import * as claude from "../motores/claude.mjs";
import * as ollama from "../motores/ollama.mjs";
import * as plantillas from "../motores/plantillas.mjs";
import { buscarNavegador } from "../nucleo/render.mjs";
import { ejecutar } from "./herramientas.mjs";
import { turno, guardarConversacion, leerConversacion, listarConversaciones } from "./agente.mjs";
import { leerDatos, pendientes, verificar } from "../sitio/construir.mjs";
import { leerTemas } from "../nucleo/conocimiento.mjs";
import * as bandeja from "../nucleo/bandeja.mjs";
import { estado as estadoWhisper } from "../nucleo/transcribir.mjs";
import * as instagram from "../motores/instagram.mjs";

const PUERTO = Number(process.env.FRAGUA_PUERTO) || 4321;

await cargarEnv();

/* ── .env, sin dependencia ─────────────────────────────────────── */

async function cargarEnv() {
  try {
    const texto = await fs.readFile(path.join(RAÍZ, ".env"), "utf8");
    for (const linea of texto.split("\n")) {
      const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const valor = m[2].trim().replace(/^["']|["']$/g, "");
      if (valor && !process.env[m[1]]) process.env[m[1]] = valor;
    }
  } catch { /* sin .env se usan los valores por defecto */ }
}

/* ── Utilidades HTTP ───────────────────────────────────────────── */

function responder(res, codigo, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(codigo, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

async function leerCuerpo(req) {
  const trozos = [];
  let total = 0;
  for await (const t of req) {
    total += t.length;
    if (total > 8 << 20) throw new Error("El cuerpo del pedido es demasiado grande.");
    trozos.push(t);
  }
  if (!trozos.length) return {};
  return JSON.parse(Buffer.concat(trozos).toString("utf8"));
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
  ".woff2":"font/woff2",
};

/** Sirve un archivo, sin dejar salir de la carpeta permitida. */
async function servirArchivo(res, base, relativo) {
  const destino = path.resolve(base, "." + path.posix.normalize("/" + relativo));
  if (!destino.startsWith(path.resolve(base))) { responder(res, 403, { error: "Fuera de lugar." }); return; }

  try {
    const datos = await fs.readFile(destino);
    res.writeHead(200, { "content-type": TIPOS[path.extname(destino)] || "application/octet-stream" });
    res.end(datos);
  } catch {
    responder(res, 404, { error: "No existe." });
  }
}

/* ── Rutas ─────────────────────────────────────────────────────── */

/** El estado de los tres motores y del renderizador, en castellano. */
async function estadoGeneral() {
  const [c, o, nav, w, ig, sitio, temas] = await Promise.all([
    claude.estado(),
    ollama.estado(),
    buscarNavegador(),
    estadoWhisper(),
    instagram.estado(),
    leerDatos(),
    leerTemas(),
  ]);

  const faltan = pendientes(sitio.ficha, sitio.valores);

  return {
    motores: {
      claude: c,
      ollama: o,
      plantillas: plantillas.estado(),
    },
    render: nav
      ? { activo: true, navegador: path.basename(nav) }
      : { activo: false, motivo: "No encontré Chrome, Edge ni Chromium. Poné la ruta en el .env con FRAGUA_NAVEGADOR." },
    audio: w,
    instagram: ig,
    sitio: {
      total: sitio.ficha.campos?.length ?? 0,
      faltan: faltan.length,
      pendientes: faltan.map((c2) => ({ clave: c2.clave, seccion: c2.seccion, pregunta: c2.pregunta, ayuda: c2.ayuda })),
    },
    temas: {
      total: (temas.temas || []).length,
      sinUsar: (temas.temas || []).filter((t) => t.estado === "idea").length,
    },
  };
}

const RUTAS_API = {

  "GET /api/estado": async () => estadoGeneral(),

  "GET /api/temas": async () => leerTemas(),

  "GET /api/conversaciones": async () => ({ conversaciones: await listarConversaciones() }),

  "POST /api/chat": async (cuerpo) => {
    const { mensaje, conversacion } = cuerpo;
    if (!mensaje || !String(mensaje).trim()) {
      return { error: "Mandame un mensaje." };
    }

    const est = await claude.estado();
    if (!est.activo) {
      return {
        error: est.motivo,
        sugerencia:
          "Sin el motor Claude no hay conversación, pero el resto de la app anda: " +
          "podés completar los datos de la página, generar piezas con plantillas y publicar.",
      };
    }

    const id = conversacion || randomUUID().slice(0, 8);
    const previo = conversacion ? await leerConversacion(conversacion) : [];

    const r = await turno(previo, String(mensaje));
    await guardarConversacion(id, r.historial);

    return { conversacion: id, respuesta: r.respuesta, pasos: r.pasos };
  },

  /* Llamar una herramienta directo, sin pasar por el modelo. Es lo que
     usan los botones del panel: completar un dato o publicar no
     necesitan que nadie razone, y así no cuestan un solo token. */
  "POST /api/herramienta": async ({ nombre, entrada }) => {
    if (!nombre) return { error: "Falta el nombre de la herramienta." };
    return ejecutar(nombre, entrada || {});
  },

  "GET /api/verificar-sitio": async () => verificar(),
};

/* ── Servidor ──────────────────────────────────────────────────── */

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const clave = `${req.method} ${url.pathname}`;

  try {
    if (RUTAS_API[clave]) {
      const cuerpo = req.method === "POST" ? await leerCuerpo(req) : Object.fromEntries(url.searchParams);
      return responder(res, 200, await RUTAS_API[clave](cuerpo));
    }

    // Las piezas generadas, para verlas en el panel.
    if (req.method === "GET" && url.pathname.startsWith("/salida/")) {
      return servirArchivo(res, RUTAS.salida, url.pathname.slice("/salida".length));
    }

    // Las tipografías de la marca, servidas del propio repositorio.
    if (req.method === "GET" && url.pathname.startsWith("/fuentes/")) {
      return servirArchivo(res, RUTAS.fuentes, url.pathname.slice("/fuentes".length));
    }

    if (req.method === "GET") {
      const relativo = url.pathname === "/" ? "/index.html" : url.pathname;
      return servirArchivo(res, RUTAS.panel, relativo);
    }

    responder(res, 404, { error: "No existe esa ruta." });
  } catch (e) {
    responder(res, 500, { error: e.message || String(e) });
  }
});

// Un puerto ocupado es el error más común al arrancar, y sin esto sale
// un volcado de pila que no le sirve a nadie.
servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(
      `\n  El puerto ${PUERTO} ya está en uso.\n\n` +
      `  Lo más probable es que ya tengas FRAGUA abierta en otra ventana:\n` +
      `  probá entrando a  http://127.0.0.1:${PUERTO}\n\n` +
      `  Si querés usar otro puerto, agregá esto al archivo .env:\n` +
      `      FRAGUA_PUERTO=4322\n`
    );
    process.exit(1);
  }
  console.error(`\n  No pude arrancar el servidor: ${e.message}\n`);
  process.exit(1);
});

// Sólo en la interfaz local: nada de esto sale a la red.
servidor.listen(PUERTO, "127.0.0.1", async () => {
  const est = await estadoGeneral();
  const marca = (x) => (x.activo ? "sí" : "no");

  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║  FRAGUA · HERALDO, el CM de AgroTitan                     ║
  ╚══════════════════════════════════════════════════════════╝

  Abrí:  http://127.0.0.1:${PUERTO}

  Motores
    Claude (el chat) ....... ${marca(est.motores.claude)}${est.motores.claude.activo ? "" : `  · ${est.motores.claude.motivo}`}
    Ollama (local) ......... ${marca(est.motores.ollama)}${est.motores.ollama.activo ? "" : `  · ${est.motores.ollama.motivo}`}
    Plantillas ............. sí
    Render de imágenes ..... ${marca(est.render)}${est.render.activo ? `  · ${est.render.navegador}` : `  · ${est.render.motivo}`}
    Transcripción de voz ... ${marca(est.audio)}${est.audio.activo ? `  · ${est.audio.motor} (${est.audio.modelo})` : ""}
    Instagram .............. ${marca(est.instagram)}${est.instagram.activo && est.instagram.diasRestantes !== null ? `  · token por ${est.instagram.diasRestantes} días` : ""}

  Página: faltan ${est.sitio.faltan} de ${est.sitio.total} datos.
  Temas sin usar: ${est.temas.sinUsar} de ${est.temas.total}.

  Para cortar: Ctrl+C
`);

  // El token de Instagram se refresca en cada arranque: con abrir la app
  // una vez cada dos meses, no se vence nunca.
  if (process.env.IG_TOKEN) {
    const t = await instagram.refrescarToken();
    if (t.refrescado) console.log(`  Token de Instagram renovado hasta ${t.hasta.slice(0, 10)}.\n`);
  }

  // Si configuraste la bandeja del celular, se vacía sola al arrancar.
  const b = await bandeja.bajar();
  if (b.bajadas) console.log(`  Bajé ${b.bajadas} captura(s) del celular a conocimiento/notas/.\n`);
  if (b.error)   console.log(`  La bandeja del celular no respondió: ${b.error}\n`);
});
