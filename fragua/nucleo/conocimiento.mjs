/* ═══════════════════════════════════════════════════════════════════
   CONOCIMIENTO · lo que HERALDO sabe de AgroTitan.

   Todo vive en archivos de texto legibles dentro de conocimiento/.
   Se pueden editar a mano con cualquier editor, se versionan con git,
   y si algún día abandonás la app el contenido sigue siendo tuyo.

   La búsqueda usa embeddings de Ollama cuando está disponible, y cae
   a buscar por palabras cuando no. Peor, pero funciona sin nada
   instalado.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";
import { RUTAS } from "./marca.mjs";
import * as ollama from "../motores/ollama.mjs";

/* ── Lectura y escritura ───────────────────────────────────────── */

async function leerJson(ruta, siFalla) {
  try { return JSON.parse(await fs.readFile(ruta, "utf8")); }
  catch { return siFalla; }
}

async function escribirJson(ruta, datos) {
  datos.actualizado = new Date().toISOString().slice(0, 10);
  await fs.writeFile(ruta, JSON.stringify(datos, null, 2) + "\n", "utf8");
}

export const leerTemas     = () => leerJson(RUTAS.temas, { temas: [] });
export const leerHashtags  = () => leerJson(RUTAS.hashtags, {});
export const leerHistorial = () => leerJson(RUTAS.historial, { publicaciones: [] });

export const guardarTemas     = (d) => escribirJson(RUTAS.temas, d);
export const guardarHistorial = (d) => escribirJson(RUTAS.historial, d);

/* ── Notas ─────────────────────────────────────────────────────── */

/** Guarda una nota nueva. El nombre sale de la fecha y del título. */
export async function guardarNota(titulo, texto, origen = "panel") {
  await fs.mkdir(RUTAS.notas, { recursive: true });

  const fecha = new Date().toISOString().slice(0, 10);
  const babosa = titulo
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "nota";

  const archivo = path.join(RUTAS.notas, `${fecha}-${babosa}.md`);
  const cuerpo =
    `# ${titulo}\n\n` +
    `<!-- ${fecha} · entró por ${origen} -->\n\n` +
    `${texto.trim()}\n`;

  await fs.writeFile(archivo, cuerpo, "utf8");
  return archivo;
}

/** Todas las notas, como { archivo, titulo, texto }. */
export async function leerNotas() {
  try {
    const nombres = (await fs.readdir(RUTAS.notas)).filter((n) => n.endsWith(".md"));
    return Promise.all(nombres.map(async (n) => {
      const texto = await fs.readFile(path.join(RUTAS.notas, n), "utf8");
      const titulo = (texto.match(/^#\s+(.+)$/m) || [, n.replace(/\.md$/, "")])[1];
      return { archivo: n, titulo, texto };
    }));
  } catch { return []; }
}

/* ── Búsqueda ──────────────────────────────────────────────────── */

/** Junta todo lo buscable en fragmentos con su procedencia. */
export async function fragmentos() {
  const trozos = [];

  const { temas = [] } = await leerTemas();
  for (const t of temas) {
    trozos.push({
      fuente: `tema:${t.id}`,
      titulo: t.titulo,
      texto: `${t.titulo}. ${t.angulo}`,
      meta: t,
    });
  }

  for (const n of await leerNotas()) {
    // Las notas largas se parten por párrafo: buscar dentro de un texto
    // de tres carillas devuelve la carilla entera y no sirve de nada.
    for (const parrafo of n.texto.split(/\n\s*\n/)) {
      const limpio = parrafo.replace(/^#+\s*/, "").replace(/<!--[\s\S]*?-->/g, "").trim();
      if (limpio.length < 40) continue;
      trozos.push({ fuente: `nota:${n.archivo}`, titulo: n.titulo, texto: limpio });
    }
  }

  try {
    const glosario = await fs.readFile(RUTAS.glosario, "utf8");
    for (const bloque of glosario.split(/\n---\n/)) {
      const titulo = (bloque.match(/^##\s+(.+)$/m) || [])[1];
      if (titulo) trozos.push({ fuente: `glosario:${titulo}`, titulo, texto: bloque.trim() });
    }
  } catch { /* todavía no hay glosario */ }

  return trozos;
}

/**
 * Busca por significado si Ollama está andando, y por palabras si no.
 * Devuelve los mejores `cuantos` fragmentos con su puntaje.
 */
export async function buscar(consulta, cuantos = 6) {
  const trozos = await fragmentos();
  if (trozos.length === 0) return [];

  const { activo } = await ollama.estado();

  if (activo) {
    try {
      const vConsulta = await ollama.embedding(consulta);
      const puntuados = [];
      for (const t of trozos) {
        const v = await ollama.embedding(t.texto.slice(0, 1500));
        puntuados.push({ ...t, puntaje: ollama.coseno(vConsulta, v) });
      }
      return puntuados.sort((a, b) => b.puntaje - a.puntaje).slice(0, cuantos);
    } catch {
      // Si Ollama se cae en la mitad, seguimos con la búsqueda por palabras.
    }
  }

  return porPalabras(consulta, trozos, cuantos);
}

/** Búsqueda simple: cuenta cuántas palabras de la consulta aparecen. */
function porPalabras(consulta, trozos, cuantos) {
  const palabras = normalizar(consulta).split(/\s+/).filter((p) => p.length > 3);
  if (!palabras.length) return [];

  return trozos
    .map((t) => {
      const texto = normalizar(`${t.titulo} ${t.texto}`);
      let puntaje = 0;
      for (const p of palabras) if (texto.includes(p)) puntaje++;
      return { ...t, puntaje: puntaje / palabras.length };
    })
    .filter((t) => t.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, cuantos);
}

function normalizar(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* ── Anti-repetición ───────────────────────────────────────────── */

/**
 * ¿Ya publicamos algo parecido?
 *
 * Es lo que separa un CM de un generador de texto: acordarse. Mira los
 * últimos `dias` y devuelve lo que se parezca por encima del umbral.
 */
export async function yaPublicamos(tema, { dias = 90, umbral = 0.82 } = {}) {
  const { publicaciones = [] } = await leerHistorial();
  if (!publicaciones.length) return [];

  const corte = Date.now() - dias * 24 * 60 * 60 * 1000;
  const recientes = publicaciones.filter((p) => new Date(p.fecha).getTime() >= corte);
  if (!recientes.length) return [];

  // Coincidencia exacta de tema: no hace falta ningún modelo para verla.
  const exactas = recientes
    .filter((p) => p.tema === tema.id || p.tema === tema)
    .map((p) => ({ ...p, puntaje: 1, motivo: "es el mismo tema" }));
  if (exactas.length) return exactas;

  const consulta = typeof tema === "string" ? tema : `${tema.titulo}. ${tema.angulo || ""}`;
  const { activo } = await ollama.estado();
  if (!activo) return [];

  try {
    const v = await ollama.embedding(consulta);
    const parecidas = [];
    for (const p of recientes) {
      const vp = await ollama.embedding(`${p.titular}. ${p.angulo || ""}`);
      const puntaje = ollama.coseno(v, vp);
      if (puntaje >= umbral) parecidas.push({ ...p, puntaje, motivo: "se parece bastante" });
    }
    return parecidas.sort((a, b) => b.puntaje - a.puntaje);
  } catch { return []; }
}

/* ── Hashtags ──────────────────────────────────────────────────── */

/**
 * Arma el set de hashtags de una pieza: una capa de rubro, una de
 * disciplina y una de territorio, entre 8 y 15 en total.
 * Nunca devuelve uno de la lista de prohibidos.
 */
export async function armarHashtags(rubro, { territorio = ["agroargentina"], cuantos = 12 } = {}) {
  const h = await leerHashtags();
  const salida = [];
  const agregar = (t) => {
    if (!t || salida.includes(t) || (h.prohibidos || []).includes(t)) return;
    if (salida.length < cuantos) salida.push(t);
  };

  for (const t of (h.rubro || {})[rubro] || []) agregar(t);
  for (const t of h.disciplina || []) agregar(t);
  for (const t of territorio) agregar(t);

  // Si el rubro tenía pocos, completamos con territorio general.
  for (const t of h.territorio || []) agregar(t);

  return salida;
}

/* ── Historial ─────────────────────────────────────────────────── */

/** Anota una pieza como publicada. */
export async function anotarPublicacion(pieza, { carpeta = "" } = {}) {
  const historial = await leerHistorial();
  historial.publicaciones.push({
    fecha:     new Date().toISOString().slice(0, 10),
    tema:      pieza.tema,
    titular:   pieza.titular,
    formato:   pieza.formato,
    audiencia: pieza.audiencia,
    carpeta,
  });
  await guardarHistorial(historial);

  // El tema del banco queda marcado, para que no vuelva a proponerse.
  const banco = await leerTemas();
  const t = (banco.temas || []).find((x) => x.id === pieza.tema);
  if (t) { t.estado = "publicado"; await guardarTemas(banco); }

  return historial.publicaciones.length;
}
