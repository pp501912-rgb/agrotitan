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
import * as linkedin from "../motores/linkedin.mjs";
import { pdfDePieza } from "./pdf.mjs";

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
        instagram: f.instagram || null,
        linkedin:  f.linkedin || null,
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

  const leer = async (nombre) => {
    try { return await fs.readFile(path.join(RUTAS.salida, carpeta, nombre), "utf8"); }
    catch { return ""; }
  };

  return {
    ...ficha,
    carpeta,
    copy: await leer("copy.txt"),
    // Si HERALDO lo adaptó, el panel avisa que va a usar éste.
    copyLinkedin: await leer("copy-linkedin.txt"),
  };
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

/* ── Publicar ──────────────────────────────────────────────────── */

/**
 * Si esta pieza puede salir en esta red, o por qué no.
 *
 * El candado mira `ficha.<red>` y no `ficha.estado`, porque una pieza
 * puede salir en dos redes: la que ya está en Instagram todavía puede
 * irse a LinkedIn. A la MISMA red, dos veces, no.
 *
 * Exigir el estado «aprobada» es lo que arrastra la regla de oro hasta
 * el último paso: una pieza con datos entre corchetes no se puede
 * aprobar, así que nada con un [X] adentro llega a publicarse.
 */
function trabaDeRed(ficha, clave, nombre) {
  if (ficha[clave]) {
    return { publicada: false, motivo: `Esta pieza ya salió en ${nombre}.`, ...ficha[clave] };
  }
  if (ficha.estado === "borrador") {
    return { publicada: false, motivo: "Primero hay que aprobarla. Miralá y dale el visto bueno." };
  }

  // «Publicada» sin registro de ninguna red es una pieza que marcaste a
  // mano: la subiste vos y no sabemos adónde. Publicarla ahora podría
  // duplicarla en el mismo lugar, y una publicación repetida es peor
  // que una negativa que podés levantar descartando y regenerando.
  if (ficha.estado === "publicada" && !ficha.instagram && !ficha.linkedin) {
    return {
      publicada: false,
      motivo:
        `Esta pieza está marcada como publicada a mano, así que no sé en qué red salió. ` +
        `Si querés que FRAGUA la suba a ${nombre}, quitale la marca editando ` +
        `ficha.json y poniendo estado en "aprobada".`,
    };
  }

  return null;
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

  const trabada = trabaDeRed(ficha, "instagram", "Instagram");
  if (trabada) return trabada;

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
    ficha.instagram = { id: r.id, permalink: r.permalink, cuando: new Date().toISOString() };
    ficha.estado = "publicada";
    ficha.publicada = ficha.publicada || ficha.instagram.cuando;
    await guardarFicha(carpeta, ficha);

    // Al historial va una sola vez, salga por donde salga: es lo que
    // evita que HERALDO vuelva a proponer el tema, no un registro de
    // publicaciones.
    if (!ficha.linkedin) await anotarPublicacion(ficha, { carpeta });

    return { publicada: true, carpeta, id: r.id, permalink: r.permalink };
  } finally {
    // Pase lo que pase, las imágenes salen de la vitrina. Y si esto
    // también falla, caducan solas en una hora.
    await vitrina.borrar(subidas.map((x) => x.id));
  }
}

/* ── Publicar en LinkedIn ──────────────────────────────────────── */

/**
 * Sube una pieza aprobada a LinkedIn.
 *
 * Dos diferencias con Instagram, las dos a favor:
 *
 * · Las imágenes se suben directo, así que no hace falta la vitrina ni
 *   dejar nada en una dirección pública mientras tanto.
 *
 * · Un carrusel se manda como PDF. LinkedIn sacó el carrusel de
 *   imágenes deslizable de las publicaciones orgánicas, y el documento
 *   es lo único que hoy se desliza. Le queda mejor al contenido, que es
 *   didáctico y encadenado.
 *
 * Si LinkedIn falla en la mitad, la pieza NO queda marcada: es mejor
 * reintentar que creer que salió algo que no salió.
 */
export async function publicarEnLinkedin(carpeta) {
  const ficha = await leerFicha(carpeta);

  const trabada = trabaDeRed(ficha, "linkedin", "LinkedIn");
  if (trabada) return trabada;

  const li = await linkedin.estado();
  if (!li.activo) return { publicada: false, motivo: li.motivo, necesitaConectar: li.necesitaConectar };

  const carpetaCompleta = path.join(RUTAS.salida, carpeta);
  if (!(ficha.imagenes || []).length) {
    return { publicada: false, motivo: "La pieza no tiene imágenes." };
  }

  // El copy de LinkedIn si existe; si no, el de Instagram. Los hashtags
  // sobran acá, pero es mejor publicar con los de más que no publicar.
  const texto = await leerCopy(carpetaCompleta);

  let medio;
  let pdf = null;

  if (ficha.formato === "carrusel" && ficha.placas?.length > 1) {
    pdf = path.join(carpetaCompleta, "carrusel.pdf");
    await pdfDePieza(
      ficha.plantilla,
      ficha.placas.map((_, i) => datosDePlaca(ficha, i)),
      pdf
    );
    medio = { documento: pdf };
  } else {
    medio = { imagenes: ficha.imagenes.map((n) => path.join(carpetaCompleta, n)) };
  }

  const r = await linkedin.publicar({ texto, titulo: ficha.titular }, medio);

  // Recién ahora, con la publicación confirmada, movemos el estado.
  ficha.linkedin = { id: r.id, permalink: r.permalink, cuando: new Date().toISOString() };
  ficha.estado = "publicada";
  ficha.publicada = ficha.publicada || ficha.linkedin.cuando;
  await guardarFicha(carpeta, ficha);

  // Al historial va una sola vez, salga por donde salga.
  if (!ficha.instagram) await anotarPublicacion(ficha, { carpeta });

  return { publicada: true, carpeta, id: r.id, permalink: r.permalink, formato: r.formato };
}

/**
 * Guarda la versión de LinkedIn del copy, al lado de la de Instagram.
 *
 * Una pieza, dos registros, una sola aprobación: las imágenes y los
 * datos son los mismos, cambia cómo se cuenta.
 */
export async function guardarCopyLinkedin(carpeta, texto) {
  if (!texto?.trim()) return { guardado: false, motivo: "El copy vino vacío." };

  const destino = path.resolve(RUTAS.salida, carpeta);
  if (!destino.startsWith(path.resolve(RUTAS.salida))) {
    return { guardado: false, motivo: "Ruta fuera de salida/." };
  }

  // Que la pieza exista, para no dejar copys sueltos de carpetas mal escritas.
  await leerFicha(carpeta);

  const hashtags = (texto.match(/#[\wáéíóúñ]+/gi) || []).length;
  await fs.writeFile(path.join(destino, "copy-linkedin.txt"), texto.trim() + "\n", "utf8");

  return {
    guardado: true,
    carpeta,
    hashtags,
    // Un aviso, no un rechazo: la vara es del prompt maestro y la
    // decisión final es de quien mira la pieza.
    nota: hashtags > 5
      ? `Son ${hashtags} hashtags. En LinkedIn van 3 a 5: más lee a desesperación.`
      : "Guardado. Al publicar en LinkedIn se usa éste en vez del de Instagram.",
  };
}

/** El copy de LinkedIn si lo adaptaste, y si no el de Instagram. */
async function leerCopy(carpetaCompleta) {
  for (const nombre of ["copy-linkedin.txt", "copy.txt"]) {
    try {
      const t = await fs.readFile(path.join(carpetaCompleta, nombre), "utf8");
      if (t.trim()) return t.trim();
    } catch { /* probamos el siguiente */ }
  }
  throw new Error("La pieza no tiene copy.");
}

/* ── Rehacer las imágenes ──────────────────────────────────────── */

/**
 * Los datos con que se renderiza la placa número `i` de una pieza.
 *
 * Vive acá y no adentro de guardar_pieza porque la usan dos: el que
 * genera la pieza por primera vez y el que la rehace desde la ficha.
 * Con dos copias, una pieza rehecha saldría distinta de la original y
 * nadie se enteraría hasta verla publicada.
 */
export function datosDePlaca(pieza, i) {
  const placa = pieza.placas[i];
  const esCarrusel = pieza.formato === "carrusel";
  const ultima = i === pieza.placas.length - 1;

  return {
    volanta: pieza.tema.replace(/-/g, " "),
    titular: placa.titulo || pieza.titular,
    subtitulo: placa.titulo,
    texto: placa.texto,
    destacado: placa.destacado,
    lista: placa.lista,
    nota: (pieza.faltantes || []).length ? "Faltan datos" : "",
    ...(esCarrusel
      ? {
          tipo: i === 0 ? "portada" : ultima ? "cierre" : "interior",
          n: i + 1,
          total: pieza.placas.length,
          accion: ultima ? "Escribinos por WhatsApp" : "",
        }
      : {}),
  };
}

/**
 * Vuelve a generar las imágenes que falten, leyendo las fichas.
 *
 * Es lo que hace honesto tener los PNG fuera del repositorio: después
 * de clonar en otra máquina, esto los trae de vuelta idénticos.
 */
export async function rehacer({ todas = false } = {}) {
  const { renderizar } = await import("./render.mjs");

  const hechas = [];
  for (const p of await listar()) {
    const carpeta = path.join(RUTAS.salida, p.carpeta);
    const ficha = await leerFicha(p.carpeta);
    if (!ficha.placas?.length) continue;

    const faltan = [];
    for (const [i, nombre] of (ficha.imagenes || []).entries()) {
      const destino = path.join(carpeta, nombre);
      if (!todas) {
        try { await fs.access(destino); continue; } catch { /* falta: se rehace */ }
      }
      faltan.push([i, destino]);
    }
    if (!faltan.length) continue;

    for (const [i, destino] of faltan) {
      await renderizar(ficha.plantilla, datosDePlaca(ficha, i), destino);
    }
    hechas.push({ carpeta: p.carpeta, imagenes: faltan.length });
  }

  return { piezas: hechas.length, imagenes: hechas.reduce((t, h) => t + h.imagenes, 0), hechas };
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

/* ── Uso desde la terminal ─────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const todas = process.argv.includes("--todas");
  const r = await rehacer({ todas });

  if (!r.imagenes) {
    console.log("No falta ninguna imagen. Para rehacerlas todas igual: --todas");
  } else {
    for (const h of r.hechas) console.log(`  ${h.carpeta} — ${h.imagenes} imagen(es)`);
    console.log(`\n${r.imagenes} imagen(es) rehechas en ${r.piezas} pieza(s).`);
  }
}
