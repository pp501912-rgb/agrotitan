/* ═══════════════════════════════════════════════════════════════════
   BOT DE TELEGRAM · HERALDO en el bolsillo.

   Tu PC le pregunta a Telegram si hay mensajes nuevos. Telegram nunca
   le habla a tu PC. Eso significa: no hay que abrir ningún puerto en
   el router, ni configurar HTTPS, ni exponer nada a internet.

   Y hay una consecuencia práctica que conviene saber: Telegram guarda
   los mensajes que no pudo entregar durante 24 horas. Si apagás la PC
   a la noche y la prendés a la mañana, el bot los levanta apenas
   arranca y no se pierde nada.

   Arranque:
     1. Escribile a @BotFather en Telegram y pedile /newbot. Dos minutos.
     2. Pegá el token en .env, en TELEGRAM_TOKEN.
     3. node telegram/bot.mjs
     4. Escribile al bot. Te va a decir tu chat ID; pegalo en
        TELEGRAM_AUTORIZADOS y reiniciá.

   SIN LA LISTA DE AUTORIZADOS EL BOT NO LE CONTESTA A NADIE. Es a
   propósito: este bot puede publicar en tu sitio.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

import { RUTAS, RAÍZ } from "../nucleo/marca.mjs";
import * as claude from "../motores/claude.mjs";
import { turno, guardarConversacion, leerConversacion } from "../servidor/agente.mjs";
import { ejecutar } from "../servidor/herramientas.mjs";

await cargarEnv();

const TOKEN = process.env.TELEGRAM_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

/** Los chats que pueden manejar el bot. Vacío = nadie. */
const AUTORIZADOS = new Set(
  (process.env.TELEGRAM_AUTORIZADOS || "")
    .split(",").map((s) => s.trim()).filter(Boolean)
);

async function cargarEnv() {
  try {
    const texto = await fs.readFile(path.join(RAÍZ, ".env"), "utf8");
    for (const linea of texto.split("\n")) {
      const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (v && !process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch { /* sin .env */ }
}

/* ── Telegram, con fetch y nada más ────────────────────────────── */

async function llamar(metodo, cuerpo) {
  const r = await fetch(`${API}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(70_000),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(`Telegram: ${d.description}`);
  return d.result;
}

const escribir = (chat, texto) =>
  llamar("sendMessage", { chat_id: chat, text: texto, parse_mode: "HTML" }).catch(() => {});

const tecleando = (chat) =>
  llamar("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});

/** Manda una imagen. Usa multipart, que es lo único que Telegram acepta. */
async function mandarImagen(chat, ruta, pie = "") {
  const datos = await fs.readFile(ruta);
  const form = new FormData();
  form.append("chat_id", String(chat));
  form.append("photo", new Blob([datos], { type: "image/png" }), path.basename(ruta));
  if (pie) form.append("caption", pie.slice(0, 1024));

  await fetch(`${API}/sendPhoto`, { method: "POST", body: form }).catch(() => {});
}

/** Baja un archivo que te mandaron (una nota de voz, por ejemplo). */
async function bajarArchivo(fileId, destino) {
  const { file_path } = await llamar("getFile", { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${file_path}`);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, Buffer.from(await r.arrayBuffer()));
  return destino;
}

/* ── Comandos rápidos ──────────────────────────────────────────── */

const COMANDOS = {
  async "/start"(chat) {
    await escribir(chat,
      `Soy <b>HERALDO</b>, el CM de AgroTitan.\n\n` +
      `Escribime lo que necesites: proponer piezas, escribir un carrusel, ` +
      `completar los datos de la página o publicarla.\n\n` +
      `Comandos: /pendientes /temas /nueva`);
  },

  async "/pendientes"(chat) {
    const s = await ejecutar("estado_sitio");
    if (!s.faltan.length) return escribir(chat, "No falta ningún dato. La página se puede publicar.");
    await escribir(chat,
      `Faltan <b>${s.faltan.length}</b> de ${s.total} datos:\n\n` +
      s.faltan.slice(0, 15).map((c) => `· ${c.pregunta}`).join("\n") +
      (s.faltan.length > 15 ? `\n\n…y ${s.faltan.length - 15} más.` : ""));
  },

  async "/temas"(chat) {
    const t = await ejecutar("listar_temas", { estado: "idea" });
    await escribir(chat,
      `<b>${t.total} temas sin usar</b>\n\n` +
      t.temas.slice(0, 12).map((x) => `· ${x.titulo}`).join("\n"));
  },

  async "/nueva"(chat) {
    conversaciones.delete(chat);
    await escribir(chat, "Listo, arrancamos una conversación nueva.");
  },
};

/* ── El bucle ──────────────────────────────────────────────────── */

/** Una conversación por chat, para que el hilo no se mezcle. */
const conversaciones = new Map();

async function atender(mensaje) {
  const chat = String(mensaje.chat.id);

  if (!AUTORIZADOS.has(chat)) {
    // Nunca contestamos, pero sí dejamos el ID en la consola de tu PC:
    // es la única forma práctica de averiguar el tuyo la primera vez.
    console.log(`Mensaje de un chat no autorizado. Su ID es: ${chat}`);
    console.log(`Si sos vos, agregalo a TELEGRAM_AUTORIZADOS en el .env y reiniciá.`);
    return;
  }

  // Nota de voz: se archiva y se avisa. La transcripción con Whisper es
  // el paso siguiente y necesita el binario instalado.
  if (mensaje.voice || mensaje.audio) {
    const id = (mensaje.voice || mensaje.audio).file_id;
    const destino = path.join(RUTAS.notas, "audios", `${Date.now()}.ogg`);
    await bajarArchivo(id, destino);
    await escribir(chat,
      `Guardé el audio en <code>conocimiento/notas/audios/</code>.\n\n` +
      `Para que lo transcriba solo hay que instalar Whisper en la PC. ` +
      `Mientras tanto, contámelo por texto y lo archivo.`);
    return;
  }

  const texto = (mensaje.text || "").trim();
  if (!texto) return;

  const comando = COMANDOS[texto.split(/\s+/)[0]];
  if (comando) return comando(chat);

  const est = await claude.estado();
  if (!est.activo) return escribir(chat, `El motor Claude está apagado: ${est.motivo}`);

  await tecleando(chat);

  const idConv = conversaciones.get(chat) || `tg-${chat}`;
  conversaciones.set(chat, idConv);

  try {
    const previo = await leerConversacion(idConv);
    const r = await turno(previo, texto);
    await guardarConversacion(idConv, r.historial);

    await escribir(chat, r.respuesta || "(sin respuesta)");

    // Si generó una pieza, mandamos las imágenes y el copy listo para copiar.
    for (const paso of r.pasos) {
      if (paso.herramienta !== "guardar_pieza" || !paso.salida?.guardada) continue;

      const carpeta = path.join(RUTAS.salida, paso.salida.carpeta);
      for (const img of paso.salida.imagenes) {
        await mandarImagen(chat, path.join(carpeta, img));
      }
      const copy = await fs.readFile(path.join(carpeta, "copy.txt"), "utf8");
      await escribir(chat, `<pre>${escaparHtml(copy)}</pre>`);
    }
  } catch (e) {
    await escribir(chat, `Se me rompió algo: ${e.message}`);
  }
}

function escaparHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function escuchar() {
  let desde = 0;

  for (;;) {
    try {
      // timeout: 60 deja la conexión esperando hasta que llegue algo, en
      // vez de preguntar una y otra vez. Es lo que Telegram recomienda.
      const novedades = await llamar("getUpdates", { offset: desde, timeout: 60 });
      for (const n of novedades) {
        desde = n.update_id + 1;
        if (n.message) await atender(n.message).catch((e) => console.error(e.message));
      }
    } catch (e) {
      if (!/aborted|timeout/i.test(e.message)) {
        console.error(`Telegram: ${e.message}. Reintento en 5 segundos.`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
}

/* ── Arranque ──────────────────────────────────────────────────── */

if (!TOKEN) {
  console.error(
    `\n  Falta TELEGRAM_TOKEN en el archivo .env.\n\n` +
    `  Escribile a @BotFather en Telegram, mandale /newbot, seguí los dos\n` +
    `  pasos que te pide y pegá acá el token que te da.\n`
  );
  process.exit(1);
}

const yo = await llamar("getMe").catch((e) => {
  console.error(`\n  El token no anda: ${e.message}\n`);
  process.exit(1);
});

console.log(`
  HERALDO en Telegram · @${yo.username}

  Autorizados: ${AUTORIZADOS.size === 0
    ? "NINGUNO todavía. Escribile al bot y te digo tu chat ID acá."
    : [...AUTORIZADOS].join(", ")}

  Para cortar: Ctrl+C
`);

await escuchar();
