/* ═══════════════════════════════════════════════════════════════════
   AGENTE · el bucle de conversación de HERALDO.

   Vos escribís → HERALDO decide qué necesita → llama a sus
   herramientas → mira el resultado → sigue o te contesta.

   El historial vive en memoria mientras el servidor está prendido, y
   se guarda en conocimiento/conversaciones/ para que puedas seguir en
   el celular lo que empezaste en la PC.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

import { RUTAS } from "../nucleo/marca.mjs";
import { conversar } from "../motores/claude.mjs";
import { DEFINICIONES, ejecutar } from "./herramientas.mjs";
import { leerDatos, pendientes } from "../sitio/construir.mjs";
import { leerTemas } from "../nucleo/conocimiento.mjs";

/** Tope de vueltas por turno. Sin esto, un bucle mal cerrado gasta plata. */
const MAX_VUELTAS = 12;

const CARPETA = path.join(RUTAS.conocimiento, "conversaciones");

/* ── Contexto del día ──────────────────────────────────────────── */

/**
 * Lo que HERALDO necesita saber hoy y cambia seguido.
 *
 * Va en un bloque aparte del prompt maestro, DESPUÉS de él: el maestro
 * está cacheado y no cambia nunca, así que si esto fuera antes,
 * invalidaría el caché todos los días.
 */
export async function contextoDelDia() {
  const [{ ficha, valores }, { temas = [] }] = await Promise.all([leerDatos(), leerTemas()]);
  const faltan = pendientes(ficha, valores);
  const disponibles = temas.filter((t) => t.estado === "idea");

  return [
    `Hoy es ${new Date().toISOString().slice(0, 10)}.`,
    ``,
    `Estado de la página: ${ficha.campos?.length - faltan.length} de ${ficha.campos?.length} datos completos.`,
    faltan.length
      ? `Faltan ${faltan.length}. Mientras falten, la página los muestra entre corchetes y no se puede publicar sin pedirlo expresamente.`
      : `Están todos: la página se puede publicar.`,
    ``,
    `Banco de temas: ${disponibles.length} sin usar todavía.`,
    disponibles.slice(0, 8).map((t) => `  · ${t.id} — ${t.titulo}`).join("\n"),
  ].join("\n");
}

/* ── El bucle ──────────────────────────────────────────────────── */

/**
 * Corre un turno completo.
 *
 * @param {Array}    historial  mensajes previos, en formato Anthropic
 * @param {string}   mensaje    lo que acaba de escribir la persona
 * @param {Function} avisar     se llama con cada paso, para mostrarlo en vivo
 * @returns {{ historial, respuesta, pasos }}
 */
export async function turno(historial, mensaje, avisar = () => {}) {
  const mensajes = [...historial, { role: "user", content: mensaje }];
  const contexto = await contextoDelDia();
  const pasos = [];

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const respuesta = await conversar({ mensajes, herramientas: DEFINICIONES, contexto });

    mensajes.push({ role: "assistant", content: respuesta.content });

    const texto = respuesta.content
      .filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (texto) avisar({ tipo: "texto", texto });

    const usos = respuesta.content.filter((b) => b.type === "tool_use");
    if (usos.length === 0) {
      return { historial: mensajes, respuesta: texto, pasos };
    }

    // Las herramientas de una misma tanda son independientes: van juntas.
    const resultados = await Promise.all(usos.map(async (uso) => {
      avisar({ tipo: "herramienta", nombre: uso.name, entrada: uso.input });
      const salida = await ejecutar(uso.name, uso.input);
      avisar({ tipo: "resultado", nombre: uso.name, salida });
      pasos.push({ herramienta: uso.name, entrada: uso.input, salida });
      return {
        type: "tool_result",
        tool_use_id: uso.id,
        content: JSON.stringify(salida),
        ...(salida && salida.error ? { is_error: true } : {}),
      };
    }));

    // Todos los resultados en un solo mensaje: si se parten en varios,
    // el modelo aprende a no pedir herramientas en paralelo nunca más.
    mensajes.push({ role: "user", content: resultados });
  }

  return {
    historial: mensajes,
    respuesta:
      `Di ${MAX_VUELTAS} vueltas y no llegué a cerrar el pedido. ` +
      `Contame de nuevo qué necesitás, más acotado.`,
    pasos,
  };
}

/* ── Persistencia de la conversación ───────────────────────────── */

/** Guarda el historial para poder seguirlo desde el celular. */
export async function guardarConversacion(id, historial) {
  await fs.mkdir(CARPETA, { recursive: true });
  await fs.writeFile(
    path.join(CARPETA, `${id}.json`),
    JSON.stringify({ id, actualizado: new Date().toISOString(), historial }, null, 2),
    "utf8"
  );
}

export async function leerConversacion(id) {
  try {
    const d = JSON.parse(await fs.readFile(path.join(CARPETA, `${id}.json`), "utf8"));
    return d.historial || [];
  } catch { return []; }
}

/** Las conversaciones guardadas, de la más reciente a la más vieja. */
export async function listarConversaciones() {
  try {
    const nombres = (await fs.readdir(CARPETA)).filter((n) => n.endsWith(".json"));
    const fichas = await Promise.all(nombres.map(async (n) => {
      const d = JSON.parse(await fs.readFile(path.join(CARPETA, n), "utf8"));
      const primero = (d.historial || []).find((m) => m.role === "user");
      const resumen = typeof primero?.content === "string" ? primero.content.slice(0, 80) : "";
      return { id: d.id, actualizado: d.actualizado, resumen };
    }));
    return fichas.sort((a, b) => (b.actualizado || "").localeCompare(a.actualizado || ""));
  } catch { return []; }
}
