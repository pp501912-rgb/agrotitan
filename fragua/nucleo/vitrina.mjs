/* ═══════════════════════════════════════════════════════════════════
   VITRINA · deja las imágenes a la vista de Meta, y las saca después.

   Para publicar en Instagram la imagen tiene que estar en una URL
   pública: Meta la va a buscar, no hay forma de subirla directo. Es el
   único problema de diseño real de la publicación automática.

   Descartamos commitear los PNG al sitio: son unos 170 kB cada uno, y
   a treinta publicaciones por mes el repositorio engorda para siempre.
   Además el despliegue de Cloudflare tarda, y publicar quedaría
   dependiendo de que hubiera terminado.

   Así que las sube al Worker de la bandeja, que ya existe y ya tiene
   KV, con una vida de una hora. La imagen vive lo justo para que Meta
   la busque y después desaparece sola, aunque nos olvidemos de
   borrarla.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

const FALTA_BANDEJA =
  "Para publicar en Instagram hace falta la bandeja desplegada: es la que\n" +
  "deja las imágenes en una dirección pública para que Meta las busque.\n\n" +
  "Está en fragua/bandeja/, y su LEEME tiene los tres comandos.\n" +
  "Después poné BANDEJA_URL y BANDEJA_TOKEN en el .env.";

export function configurada() {
  return Boolean(process.env.BANDEJA_URL && process.env.BANDEJA_TOKEN);
}

export function estado() {
  return configurada() ? { activo: true } : { activo: false, motivo: FALTA_BANDEJA };
}

function base() {
  return process.env.BANDEJA_URL.replace(/\/$/, "");
}

/**
 * Sube una imagen y devuelve su URL pública.
 * La dirección es aleatoria y el archivo caduca en una hora.
 */
export async function subir(archivo) {
  if (!configurada()) throw new Error(FALTA_BANDEJA);

  const datos = await fs.readFile(archivo);

  const r = await fetch(`${base()}/i`, {
    method: "POST",
    headers: {
      "content-type": "image/png",
      "x-bandeja-token": process.env.BANDEJA_TOKEN,
      "x-bandeja-nombre": path.basename(archivo),
    },
    body: datos,
    signal: AbortSignal.timeout(60_000),
  });

  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) {
    throw new Error(`La bandeja no aceptó la imagen (${r.status}): ${d.error || "sin detalle"}`);
  }
  return { id: d.id, url: d.url };
}

/** Sube varias, en orden. */
export async function subirVarias(archivos) {
  const subidas = [];
  for (const a of archivos) subidas.push(await subir(a));
  return subidas;
}

/**
 * Borra lo subido. Nunca lanza: si falla, las imágenes caducan solas
 * en una hora y no hay nada que arreglar a mano.
 */
export async function borrar(ids) {
  if (!configurada() || !ids?.length) return { borradas: 0 };
  try {
    const r = await fetch(`${base()}/i/borrar`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bandeja-token": process.env.BANDEJA_TOKEN,
      },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(30_000),
    });
    const d = await r.json().catch(() => ({}));
    return { borradas: d.borradas ?? 0 };
  } catch { return { borradas: 0, nota: "Caducan solas en una hora." }; }
}
