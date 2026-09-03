/* ═══════════════════════════════════════════════════════════════════
   MOTOR CLAUDE · el que conversa y el que escribe lo que se publica.

   Es el único de los tres motores que necesita una dependencia de npm,
   y es opcional: si @anthropic-ai/sdk no está instalado o falta la
   clave, este motor se apaga solo y la app sigue andando con Ollama y
   con las plantillas.

   El prompt maestro va en un bloque cacheado. Eso hace que cada pedido
   diario cueste dos líneas en lugar de repetir todo el contexto de
   marca, que es de dónde sale el ahorro real.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import { RUTAS } from "../nucleo/marca.mjs";

const MODELO = process.env.FRAGUA_MODELO || "claude-opus-5";

let cliente;
let motivoApagado = null;

/**
 * Carga el SDK y arma el cliente. Devuelve null si no se puede, con el
 * motivo en `motivoApagado` para que el panel lo explique en castellano.
 */
async function obtenerCliente() {
  if (cliente !== undefined) return cliente;

  if (!process.env.ANTHROPIC_API_KEY) {
    motivoApagado =
      "Falta ANTHROPIC_API_KEY en el archivo .env. Se saca de " +
      "console.anthropic.com → API Keys.";
    cliente = null;
    return null;
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    cliente = new Anthropic();
  } catch {
    motivoApagado =
      "Falta el paquete @anthropic-ai/sdk. Instalalo con:  npm install";
    cliente = null;
  }
  return cliente;
}

/** ¿Está disponible este motor? Devuelve { activo, motivo }. */
export async function estado() {
  const c = await obtenerCliente();
  return c ? { activo: true, modelo: MODELO } : { activo: false, motivo: motivoApagado };
}

let promptMaestro;

/** El cerebro de marca. Se lee del disco una vez por arranque. */
export async function leerPromptMaestro() {
  if (promptMaestro === undefined) {
    promptMaestro = await fs.readFile(RUTAS.promptMaestro, "utf8");
  }
  return promptMaestro;
}

/**
 * Una vuelta de conversación con herramientas.
 *
 * @param {object} opciones
 * @param {Array}  opciones.mensajes     historial en formato Anthropic
 * @param {Array}  opciones.herramientas definiciones de herramientas
 * @param {string} opciones.contexto     lo que HERALDO tiene que saber hoy
 * @returns el mensaje completo de la API
 */
export async function conversar({ mensajes, herramientas = [], contexto = "" }) {
  const c = await obtenerCliente();
  if (!c) throw new Error(motivoApagado);

  const maestro = await leerPromptMaestro();

  // El orden importa para el caché: primero lo que no cambia nunca
  // (el prompt maestro), después lo que cambia a diario (el contexto).
  // Al revés, cada día invalidaría el caché entero.
  const system = [
    {
      type: "text",
      text: SISTEMA + "\n\n" + maestro,
      cache_control: { type: "ephemeral" },
    },
  ];
  if (contexto) system.push({ type: "text", text: contexto });

  const respuesta = await c.messages.create({
    model: MODELO,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system,
    messages: mensajes,
    ...(herramientas.length ? { tools: herramientas } : {}),
  });

  return respuesta;
}

/** Una sola pregunta sin herramientas ni historial. Devuelve texto. */
export async function preguntar(instruccion, { contexto = "" } = {}) {
  const r = await conversar({
    mensajes: [{ role: "user", content: instruccion }],
    contexto,
  });
  return r.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

const SISTEMA = `Sos HERALDO, el community manager de AgroTitan. Trabajás en la
computadora de la persona que te habla, dentro de una aplicación local llamada
FRAGUA.

Tu trabajo tiene dos mitades:
  1. Producir contenido para Instagram: el texto, los hashtags y las placas.
  2. Mantener la página de AgroTitan: completar los datos que faltan y publicarla.

Cómo trabajás:

· Hablás en español rioplatense, con voseo. Sos directo y breve. La persona con
  la que hablás conoce el negocio mucho mejor que vos.

· Antes de escribir sobre un tema, buscá en el conocimiento. Nunca escribas de
  memoria sobre AgroTitan: lo que no esté en los archivos, no existe.

· La regla que no se negocia: NINGÚN dato que no esté en los archivos se
  inventa. Ni una cifra, ni un año, ni una superficie, ni un precio. Si hace
  falta y no está, va entre corchetes y lo reportás en "faltantes".

· Cuando propongas una pieza, mostrale primero el texto y esperá su visto bueno
  antes de renderizar las imágenes. Renderizar es barato pero corregir sobre la
  imagen es incómodo.

· Si te pide algo que contradice el prompt maestro —inventar una cifra, nombrar
  un cliente, prometer rentabilidad— decílo en una frase y ofrecé la alternativa
  más cercana. No lo repitas dos veces ni des un sermón.

· Cuando termines algo, decí qué hiciste en una línea. No enumeres tus pasos.

El prompt maestro completo viene a continuación. Es la única fuente de verdad
sobre cómo habla AgroTitan.`;
