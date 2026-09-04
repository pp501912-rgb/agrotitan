/* ═══════════════════════════════════════════════════════════════════
   PIEZAS · el ciclo de vida de lo que se genera.

   Una pieza vive en salida/AAAA-MM-DD-tema/ con sus imágenes, el copy
   y una ficha. Pasa por tres estados:

     borrador   recién generada, sin revisar
     aprobada   la miraste y está para subir
     publicada  ya salió; queda anotada en el historial

   El paso de aprobación es a propósito y no se puede saltear desde el
   chat. Con contenido que menciona cifras, que una persona mire antes
   vale más que cualquier automatización.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

import { RUTAS } from "./marca.mjs";
import { anotarPublicacion } from "./conocimiento.mjs";
import * as vitrina from "./vitrina.mjs";
import * as instagram from "../motores/instagram.mjs";

/** Lee la ficha de una carpeta de salida. */
async function leerFicha(carpeta) {
  const ruta = path.join(RUTAS.salida, carpeta, "ficha.json");
  return JSON.parse(await fs.readFile(ruta, "utf8"));
}

async function guardarFicha(carpeta, ficha) {
  const ruta = path.join(RUTAS.salida, carpeta, "ficha.json");
  await fs.writeFile(ruta, JSON.stringify(ficha, null, 2) + "\n", "utf8");
}

/**
 * Todas las piezas generadas, de la más nueva a la más vieja.
 * Devuelve lo justo para pintar una lista: la ficha completa se lee
 * al abrir una.
 */
export async function listar() {
  let carpetas;
  try {
    carpetas = await fs.readdir(RUTAS.salida, { withFileTypes: true });
  } catch { return []; }

  const piezas = [];
  for (const d of carpetas) {
    // respaldos/ es de publicar.mjs, no es una pieza.
    if (!d.isDirectory() || d.name === "respaldos") continue;
    try {
      const f = await leerFicha(d.name);
      piezas.push({
        carpeta:   d.name,
        creada:    f.creada || null,
        fecha:     f.fecha,
        tema:      f.tema,
        titular:   f.titular,
        formato:   f.formato,
        plantilla: f.plantilla,
        audiencia: f.audiencia,
        estado:    f.estado || "borrador",
        imagenes:  f.imagenes || [],
        faltantes: f.faltantes || [],
      });
    } catch { /* carpeta a medio escribir: la salteamos */ }
  }

  // El nombre de la carpeta empieza con la fecha, así que ordenarlas por
  // nombre alcanza para separar días. Dentro del mismo día no: ahí manda
  // la marca de tiempo que guarda guardar_pieza.
  return piezas.sort((a, b) =>
    b.carpeta.localeCompare(a.carpeta) ||
    (b.creada || "").localeCompare(a.creada || "")
  );
}

/** Una pieza con todo: ficha, copy y nombres de las imágenes. */
export async function abrir(carpeta) {
  const ficha = await leerFicha(carpeta);
  let copy = "";
  try { copy = await fs.readFile(path.join(RUTAS.salida, carpeta, "copy.txt"), "utf8"); } catch { /* sin copy */ }
  return { ...ficha, carpeta, copy };
}

/**
 * Marca una pieza como aprobada.
 *
 * Se niega si tiene datos entre corchetes: aprobar una pieza con un
 * dato sin completar es exactamente lo que la regla de oro evita.
 */
export async function aprobar(carpeta) {
  const ficha = await leerFicha(carpeta);

  if ((ficha.faltantes || []).length) {
    return {
      aprobada: false,
      motivo:
        `Esta pieza tiene ${ficha.faltantes.length} dato(s) sin completar y salen ` +
        `entre corchetes en la imagen.`,
      faltantes: ficha.faltantes,
    };
  }

  ficha.estado = "aprobada";
  ficha.aprobada = new Date().toISOString();
  await guardarFicha(carpeta, ficha);
  return { aprobada: true, carpeta };
}

/** La subiste a Instagram: queda anotada para no repetir el tema. */
export async function marcarPublicada(carpeta) {
  const ficha = await leerFicha(carpeta);

  if (ficha.estado === "borrador") {
    return { publicada: false, motivo: "Todavía no la aprobaste. Miralá primero." };
  }

  ficha.estado = "publicada";
  ficha.publicada = new Date().toISOString();
  await guardarFicha(carpeta, ficha);

  const total = await anotarPublicacion(ficha, { carpeta });
  return { publicada: true, carpeta, enHistorial: total };
}

/* ── Publicar en Instagram ─────────────────────────────────────── */

/**
 * Sube una pieza aprobada a Instagram.
 *
 * Exige que esté aprobada, y como una pieza con datos entre corchetes
 * no se puede aprobar, esa condición arrastra la regla de oro hasta el
 * último paso: nada con un [X] adentro puede llegar a publicarse.
 *
 * Si Meta falla en la mitad, la pieza NO queda marcada como publicada:
 * es mejor reintentar que creer que salió algo que no salió.
 */
export async function publicarEnInstagram(carpeta) {
  const ficha = await leerFicha(carpeta);

  if (ficha.estado === "publicada") {
    return { publicada: false, motivo: "Esta pieza ya está publicada." };
  }
  if (ficha.estado !== "aprobada") {
    return { publicada: false, motivo: "Primero hay que aprobarla. Miralá y dale el visto bueno." };
  }

  const ig = await instagram.estado();
  if (!ig.activo) return { publicada: false, motivo: ig.motivo };

  const v = vitrina.estado();
  if (!v.activo) return { publicada: false, motivo: v.motivo };

  const carpetaCompleta = path.join(RUTAS.salida, carpeta);
  const archivos = (ficha.imagenes || []).map((n) => path.join(carpetaCompleta, n));
  if (!archivos.length) return { publicada: false, motivo: "La pieza no tiene imágenes." };

  const copy = await fs.readFile(path.join(carpetaCompleta, "copy.txt"), "utf8");

  let subidas = [];
  try {
    subidas = await vitrina.subirVarias(archivos);
    const r = await instagram.publicar({ caption: copy.trim() }, subidas.map((x) => x.url));

    // Recién ahora, con la publicación confirmada, movemos el estado.
    ficha.estado = "publicada";
    ficha.publicada = new Date().toISOString();
    ficha.instagram = { id: r.id, permalink: r.permalink };
    await guardarFicha(carpeta, ficha);
    await anotarPublicacion(ficha, { carpeta });

    return { publicada: true, carpeta, id: r.id, permalink: r.permalink };
  } finally {
    // Pase lo que pase, las imágenes salen de la vitrina. Y si esto
    // también falla, caducan solas en una hora.
    await vitrina.borrar(subidas.map((x) => x.id));
  }
}

/** Borra una pieza que no va. */
export async function descartar(carpeta) {
  const destino = path.resolve(RUTAS.salida, carpeta);
  if (!destino.startsWith(path.resolve(RUTAS.salida))) {
    return { borrada: false, motivo: "Ruta fuera de salida/." };
  }
  await fs.rm(destino, { recursive: true, force: true });
  return { borrada: true, carpeta };
}
