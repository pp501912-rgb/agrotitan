/* ═══════════════════════════════════════════════════════════════════
   INSTAGRAM · publicar una pieza aprobada.

   Es lo único de FRAGUA que manda algo al mundo, así que tiene más
   frenos que el resto: sólo publica piezas aprobadas, avisa la cuota
   que queda antes de empezar, y no está entre las herramientas que ve
   el modelo. Apretar el botón es una decisión de una persona.

   Dos cosas que conviene saber del funcionamiento de Meta:

   · El token dura 60 días y se puede refrescar en cualquier momento
     entre las 24 horas y el vencimiento, y cada refresco da otros 60.
     FRAGUA lo refresca en cada arranque, así que con abrir la app una
     vez cada dos meses el token no se vence nunca. Si se venció, no
     hay refresco posible: hay que sacar uno nuevo a mano.

   · La imagen tiene que estar en una URL pública en el momento de
     publicar: Meta la va a buscar. No hay forma de subir el archivo
     directo. De eso se ocupa nucleo/vitrina.mjs.

   El token vivo NO se guarda en el .env ni en el repositorio: vive en
   fragua/.instagram.json, que está en el .gitignore. El .env sólo
   tiene el token inicial, el que pegás la primera vez.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

import { RAÍZ } from "../nucleo/marca.mjs";

/** La API se puede apuntar a otro lado para las pruebas. */
const API = () => process.env.IG_API || "https://graph.instagram.com";

/** Dónde vive el token vivo. Nunca al repositorio. */
const ESTADO = () => process.env.IG_ARCHIVO || path.join(RAÍZ, ".instagram.json");

const DIA = 24 * 60 * 60 * 1000;

const COMO_CONFIGURAR =
  "Instagram no está configurado.\n\n" +
  "Hace falta, una sola vez:\n" +
  "  1. Crear una app en developers.facebook.com y agregarle el producto\n" +
  "     «Instagram» con inicio de sesión de Instagram.\n" +
  "  2. Agregar tu cuenta como Instagram Tester y aceptar la invitación.\n" +
  "  3. Generar un token de larga duración y copiar el ID de tu cuenta.\n" +
  "  4. Pegar los dos en el .env, en IG_TOKEN e IG_CUENTA.\n\n" +
  "No hace falta página de Facebook ni revisión de Meta: publicar en tu\n" +
  "propia cuenta con la app en modo desarrollo no la necesita.";

/* ── El token vivo ─────────────────────────────────────────────── */

async function leerEstado() {
  try { return JSON.parse(await fs.readFile(ESTADO(), "utf8")); }
  catch { return null; }
}

async function guardarEstado(datos) {
  await fs.writeFile(ESTADO(), JSON.stringify(datos, null, 2) + "\n", "utf8");
  return datos;
}

/**
 * El token que hay que usar ahora.
 *
 * El del archivo gana sobre el del .env: es el refrescado. Si cambiaste
 * el .env a mano —porque el viejo se venció— ese gana de nuevo, y por
 * eso comparamos contra el token semilla guardado.
 */
async function tokenActual() {
  const semilla = process.env.IG_TOKEN;
  const guardado = await leerEstado();

  if (guardado?.token && guardado.semilla === semilla) {
    return { token: guardado.token, desde: guardado.desde, hasta: guardado.hasta };
  }
  if (!semilla) return null;

  // Primera vez, o cambiaste el token a mano: arrancamos de cero.
  return { token: semilla, desde: null, hasta: null };
}

/* ── Estado, para la pantalla del panel ────────────────────────── */

/** { activo, cuenta, diasRestantes } o el motivo, en castellano. */
export async function estado() {
  if (!process.env.IG_TOKEN || !process.env.IG_CUENTA) {
    return { activo: false, motivo: COMO_CONFIGURAR };
  }

  const actual = await tokenActual();
  const guardado = await leerEstado();

  let diasRestantes = null;
  if (actual.hasta) {
    // Truncar y no redondear hacia abajo: con floor, un token vencido
    // hace cinco días y un rato decía "hace seis", que es la clase de
    // detalle que hace dudar del resto del mensaje.
    diasRestantes = Math.trunc((new Date(actual.hasta).getTime() - Date.now()) / DIA);
    if (diasRestantes < 0) {
      return {
        activo: false,
        motivo:
          `El token de Instagram se venció hace ${-diasRestantes} días y ya no se ` +
          `puede refrescar. Generá uno nuevo en developers.facebook.com y pegalo ` +
          `en el .env, en IG_TOKEN.`,
      };
    }
  }

  return {
    activo: true,
    cuenta: process.env.IG_CUENTA,
    usuario: guardado?.usuario || null,
    diasRestantes,
    // Un aviso temprano vale más que un error el día que se rompe.
    aviso: diasRestantes !== null && diasRestantes < 10
      ? `El token vence en ${diasRestantes} días. Abrí FRAGUA antes de eso y se ` +
        `renueva solo; si lo dejás pasar hay que sacar uno nuevo a mano.`
      : null,
  };
}

/* ── Llamadas a Meta ───────────────────────────────────────────── */

async function pedir(ruta, { metodo = "GET", parametros = {}, token } = {}) {
  const url = new URL(`${API()}${ruta}`);
  const cuerpo = new URLSearchParams({ ...parametros, access_token: token });

  const r = await fetch(metodo === "GET" ? `${url}?${cuerpo}` : url, {
    method: metodo,
    ...(metodo === "GET" ? {} : {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: cuerpo,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const datos = await r.json().catch(() => ({}));
  if (!r.ok || datos.error) {
    const e = datos.error || {};
    throw new Error(
      `Instagram (${r.status}): ${e.message || "sin detalle"}` +
      (e.error_user_msg ? `\n${e.error_user_msg}` : "")
    );
  }
  return datos;
}

/**
 * Refresca el token si corresponde.
 *
 * Meta exige que tenga más de 24 horas, así que la primera vez no se
 * refresca y no es un error. Nunca lanza: si falla, la app arranca
 * igual y el token viejo sigue sirviendo hasta que venza.
 */
export async function refrescarToken() {
  const actual = await tokenActual();
  if (!actual) return { refrescado: false, motivo: "No hay token configurado." };

  if (actual.desde && Date.now() - new Date(actual.desde).getTime() < DIA) {
    return { refrescado: false, motivo: "Todavía no tiene 24 horas: Meta no lo refresca." };
  }

  try {
    const d = await pedir("/refresh_access_token", {
      parametros: { grant_type: "ig_refresh_token" },
      token: actual.token,
    });

    const ahora = new Date();
    const hasta = new Date(ahora.getTime() + (d.expires_in || 60 * 86400) * 1000);

    const guardado = await leerEstado();
    await guardarEstado({
      ...guardado,
      semilla: process.env.IG_TOKEN,
      token: d.access_token,
      desde: ahora.toISOString(),
      hasta: hasta.toISOString(),
    });

    return { refrescado: true, hasta: hasta.toISOString() };
  } catch (e) {
    return { refrescado: false, motivo: e.message };
  }
}

/** Cuántas publicaciones quedan en las últimas 24 horas. */
export async function cuotaRestante() {
  const actual = await tokenActual();
  if (!actual) throw new Error(COMO_CONFIGURAR);

  const d = await pedir(`/${process.env.IG_CUENTA}/content_publishing_limit`, {
    parametros: { fields: "config,quota_usage" },
    token: actual.token,
  });

  const fila = (d.data || [])[0] || {};
  const tope = fila.config?.quota_total ?? 50;
  const usadas = fila.quota_usage ?? 0;
  return { tope, usadas, quedan: Math.max(0, tope - usadas) };
}

/* ── Publicar ──────────────────────────────────────────────────── */

/**
 * Publica una pieza.
 *
 * @param {object} pieza  { caption, formato }
 * @param {string[]} urls  las imágenes, ya en URLs públicas
 * @returns {{ id, permalink }}
 */
export async function publicar({ caption }, urls) {
  const actual = await tokenActual();
  if (!actual) throw new Error(COMO_CONFIGURAR);
  if (!urls?.length) throw new Error("No hay ninguna imagen para publicar.");
  if (urls.length > 10) {
    throw new Error(`Un carrusel admite hasta 10 imágenes y esta pieza tiene ${urls.length}.`);
  }

  const cuenta = process.env.IG_CUENTA;
  const token = actual.token;

  const { quedan, tope } = await cuotaRestante();
  if (quedan <= 0) {
    throw new Error(
      `Instagram no deja publicar más por ahora: usaste las ${tope} de las ` +
      `últimas 24 horas. La cuota se libera 24 horas después de cada ` +
      `publicación, no a medianoche.`
    );
  }

  let contenedor;

  if (urls.length === 1) {
    const d = await pedir(`/${cuenta}/media`, {
      metodo: "POST",
      parametros: { image_url: urls[0], caption },
      token,
    });
    contenedor = d.id;
  } else {
    // Cada imagen es su propio contenedor, y después uno que los agrupa.
    // El orden importa: es el que va a ver quien deslice.
    const hijos = [];
    for (const url of urls) {
      const d = await pedir(`/${cuenta}/media`, {
        metodo: "POST",
        parametros: { image_url: url, is_carousel_item: "true" },
        token,
      });
      hijos.push(d.id);
    }

    const d = await pedir(`/${cuenta}/media`, {
      metodo: "POST",
      parametros: { media_type: "CAROUSEL", children: hijos.join(","), caption },
      token,
    });
    contenedor = d.id;
  }

  const publicada = await pedir(`/${cuenta}/media_publish`, {
    metodo: "POST",
    parametros: { creation_id: contenedor },
    token,
  });

  // El permalink es lo único que le sirve a una persona, así que lo
  // buscamos aparte. Si falla, la publicación ya salió igual.
  let permalink = null;
  try {
    const d = await pedir(`/${publicada.id}`, { parametros: { fields: "permalink" }, token });
    permalink = d.permalink || null;
  } catch { /* la pieza ya está publicada; el enlace es un extra */ }

  return { id: publicada.id, permalink, imagenes: urls.length };
}
