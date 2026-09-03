/* ═══════════════════════════════════════════════════════════════════
   CONTRATO · valida lo que devuelve cualquier motor de texto.

   Los tres motores —plantillas, Ollama y Claude— tienen que devolver
   la misma forma. Este archivo es el que lo hace cumplir, y es el que
   sostiene la regla de oro del prompt maestro:

     si el texto tiene corchetes, la lista de faltantes no puede estar
     vacía.

   Sin esa comprobación, un modelo distraído puede escribir "[X] años
   de trayectoria" y no reportarlo, y la cifra falsa termina publicada.
   En un negocio cuyo activo es la credibilidad numérica, eso es lo
   único que no se puede permitir.
   ═══════════════════════════════════════════════════════════════════ */

import { PLANTILLAS, AUDIENCIAS } from "./marca.mjs";

const FORMATOS = ["placa", "carrusel", "historia"];

/**
 * Detecta [datos entre corchetes].
 *
 * Un solo carácter adentro cuenta: "[X]" es exactamente el marcador que
 * más aparece en este proyecto —las cuatro cifras de trayectoria del
 * hero son todas "[X]"— y una versión anterior de este patrón exigía
 * dos caracteres, así que las dejaba pasar sin reportar. Justo el caso
 * que esta regla existe para atrapar.
 */
const CORCHETES = /\[[^\]\n]{1,80}\]/g;

/**
 * Revisa una pieza y devuelve { pieza, problemas: [] }.
 * No lanza: devuelve los problemas para poder mostrárselos a quien
 * escribió el prompt y reintentar con la corrección.
 */
export function revisar(pieza) {
  const problemas = [];
  const p = (m) => problemas.push(m);

  if (!pieza || typeof pieza !== "object") {
    return { pieza: null, problemas: ["La respuesta no es un objeto JSON."] };
  }

  // ── Campos obligatorios y valores permitidos ──────────────────
  if (!FORMATOS.includes(pieza.formato)) {
    p(`"formato" debe ser uno de ${FORMATOS.join(", ")} y vino «${pieza.formato}».`);
  }
  if (!PLANTILLAS.includes(pieza.plantilla)) {
    p(`"plantilla" debe ser una de ${PLANTILLAS.join(", ")} y vino «${pieza.plantilla}».`);
  }
  if (!AUDIENCIAS.includes(pieza.audiencia)) {
    p(`"audiencia" debe ser ${AUDIENCIAS.join(" o ")} y vino «${pieza.audiencia}». ` +
      `Una pieza elige una: promediar las dos produce un texto tibio.`);
  }
  if (!pieza.tema || !/^[a-z0-9-]+$/.test(pieza.tema)) {
    p(`"tema" debe ser un identificador en minúsculas con guiones.`);
  }
  if (!pieza.titular || typeof pieza.titular !== "string") {
    p(`Falta "titular".`);
  } else if (pieza.titular.length > 90) {
    p(`El titular tiene ${pieza.titular.length} caracteres y el máximo es 90.`);
  }

  // ── Placas ────────────────────────────────────────────────────
  const placas = Array.isArray(pieza.placas) ? pieza.placas : null;
  if (!placas || placas.length === 0) {
    p(`"placas" tiene que ser un arreglo con al menos un elemento.`);
  } else if (pieza.formato === "placa" && placas.length !== 1) {
    p(`Formato "placa" lleva exactamente una placa y vinieron ${placas.length}.`);
  } else if (pieza.formato === "carrusel" && (placas.length < 4 || placas.length > 8)) {
    p(`Un carrusel lleva entre 4 y 8 placas y vinieron ${placas.length}.`);
  }

  // Los límites de largo salen del lienzo de 1080 × 1350: más que esto
  // no se lee en un teléfono.
  (placas || []).forEach((pl, i) => {
    const n = i + 1;
    if (pl.titulo && pl.titulo.length > 60) {
      p(`Placa ${n}: el título tiene ${pl.titulo.length} caracteres y entran 60.`);
    }
    if (pl.texto && pl.texto.length > 220) {
      p(`Placa ${n}: el texto tiene ${pl.texto.length} caracteres y entran 220.`);
    }
    if (!pl.titulo && !pl.texto) p(`Placa ${n}: no tiene ni título ni texto.`);
  });

  // ── Caption y hashtags ────────────────────────────────────────
  if (!pieza.caption || typeof pieza.caption !== "string") {
    p(`Falta "caption".`);
  } else {
    const palabras = pieza.caption.trim().split(/\s+/).length;
    if (palabras > 150) p(`El caption tiene ${palabras} palabras y el máximo es 150. Si no entra, es carrusel.`);
    if (palabras < 25)  p(`El caption tiene ${palabras} palabras: se queda corto para sostener el argumento.`);
  }

  const tags = Array.isArray(pieza.hashtags) ? pieza.hashtags : [];
  if (tags.length < 8 || tags.length > 15) {
    p(`Los hashtags tienen que ser entre 8 y 15 y vinieron ${tags.length}.`);
  }
  const conNumeral = tags.filter((t) => typeof t === "string" && t.startsWith("#"));
  if (conNumeral.length) p(`Los hashtags van sin el numeral: ${conNumeral.join(", ")}.`);

  if (!pieza.cta) p(`Falta "cta": toda pieza termina en una sola acción.`);

  // ── La regla de oro ───────────────────────────────────────────
  const faltantes = Array.isArray(pieza.faltantes) ? pieza.faltantes : [];
  const textoCompleto = [
    pieza.titular, pieza.caption, pieza.cta,
    ...(placas || []).flatMap((pl) => [pl.titulo, pl.texto, pl.destacado]),
  ].filter(Boolean).join("\n");

  const corchetes = [...new Set(textoCompleto.match(CORCHETES) || [])];
  if (corchetes.length && faltantes.length === 0) {
    p(
      `Hay datos entre corchetes (${corchetes.join(", ")}) y "faltantes" está vacío. ` +
      `Todo dato que no esté en los archivos va entre corchetes Y se reporta. ` +
      `Es la regla de oro del prompt maestro.`
    );
  }

  if (!Array.isArray(pieza.fuentes) || pieza.fuentes.length === 0) {
    p(`"fuentes" no puede ir vacío: toda afirmación tiene que poder rastrearse.`);
  }

  return { pieza: problemas.length ? null : normalizar(pieza), problemas };
}

/** Deja la pieza con la forma canónica, para que el resto del código confíe. */
function normalizar(pieza) {
  return {
    formato:   pieza.formato,
    plantilla: pieza.plantilla,
    audiencia: pieza.audiencia,
    tema:      pieza.tema,
    titular:   pieza.titular.trim(),
    placas:    pieza.placas.map((pl, i) => ({
      n:         pl.n ?? i + 1,
      titulo:    (pl.titulo || "").trim(),
      texto:     (pl.texto || "").trim(),
      destacado: (pl.destacado || "").trim(),
      lista:     Array.isArray(pl.lista) ? pl.lista : [],
    })),
    caption:   pieza.caption.trim(),
    hashtags:  pieza.hashtags.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean),
    cta:       String(pieza.cta).trim(),
    faltantes: (pieza.faltantes || []).map(String),
    fuentes:   pieza.fuentes.map(String),
  };
}

/**
 * Extrae el JSON de una respuesta de modelo.
 *
 * Los modelos a veces envuelven el JSON en ```json … ``` o le agregan
 * una frase de cortesía adelante, aunque el prompt lo prohíba. En vez
 * de fallar por eso, lo recortamos.
 */
export function extraerJson(texto) {
  if (typeof texto !== "string") return null;

  const enCerca = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidato = enCerca ? enCerca[1] : texto;

  const desde = candidato.indexOf("{");
  const hasta = candidato.lastIndexOf("}");
  if (desde === -1 || hasta <= desde) return null;

  try { return JSON.parse(candidato.slice(desde, hasta + 1)); }
  catch { return null; }
}
