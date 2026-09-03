/* ═══════════════════════════════════════════════════════════════════
   CASCADA · el híbrido que de verdad ahorra.

   Ollama genera ocho borradores en tu PC, gratis. Claude recibe los
   ocho en UNA sola llamada corta, elige el mejor y lo pule.

   Se paga una llamada en lugar de ocho, y la calidad final la pone
   Claude igual. La regla detrás es la misma de todo el proyecto:
   Claude donde el error se ve, Ollama donde el error se descarta.

   Si Ollama no está instalado, esto no falla: le pide directamente a
   Claude y avisa que no hubo cascada.
   ═══════════════════════════════════════════════════════════════════ */

import * as ollama from "./ollama.mjs";
import { preguntar } from "./claude.mjs";

/**
 * Genera con cascada.
 *
 * @param {string} pedido  qué se quiere, en una o dos líneas
 * @param {object} opciones
 * @param {number} opciones.cuantas   borradores locales (8 por defecto)
 * @param {string} opciones.criterio  con qué vara elegir el mejor
 * @param {string} opciones.contexto  material del conocimiento, si hay
 */
export async function generar(pedido, { cuantas = 8, criterio = "", contexto = "" } = {}) {
  const est = await ollama.estado();

  // Sin Ollama no hay cascada, pero sí hay resultado.
  if (!est.activo) {
    const texto = await preguntar(
      `${pedido}\n\nDevolvé sólo el texto pedido, sin explicaciones.`,
      { contexto }
    );
    return { texto, cascada: false, motivo: est.motivo, borradores: 0 };
  }

  const borradores = await ollama.variantes(
    `${pedido}\n\nDevolvé sólo el texto pedido, sin numerarlo ni explicarlo.`,
    cuantas,
    {
      sistema:
        "Escribís para AgroTitan, evaluación de proyectos agropecuarios. " +
        "Español rioplatense con voseo, registro sobrio y técnico. " +
        "Nunca inventes cifras: lo que no sepas, dejalo entre corchetes.",
    }
  );

  // Si Ollama se cayó en el medio y no salió ninguno, seguimos igual.
  if (borradores.length === 0) {
    const texto = await preguntar(pedido, { contexto });
    return { texto, cascada: false, motivo: "Ollama no devolvió ningún borrador.", borradores: 0 };
  }

  const numerados = borradores
    .map((b, i) => `── Borrador ${i + 1} ──\n${b.trim()}`)
    .join("\n\n");

  const texto = await preguntar(
    [
      `Un modelo local produjo ${borradores.length} borradores para este pedido:`,
      ``,
      `PEDIDO: ${pedido}`,
      criterio ? `CRITERIO PARA ELEGIR: ${criterio}` : "",
      ``,
      numerados,
      ``,
      `Elegí el mejor —o combiná lo mejor de varios— y devolvelo pulido, en tono`,
      `de marca. Los borradores son materia prima, no propuestas: cambiá todo lo`,
      `que haga falta. Si ninguno sirve, escribilo de cero.`,
      ``,
      `Devolvé SÓLO el texto final, sin comentarios sobre tu elección.`,
    ].filter(Boolean).join("\n"),
    { contexto }
  );

  return { texto, cascada: true, borradores: borradores.length };
}

/**
 * Modo espejo: la misma cosa con los dos motores, lado a lado.
 *
 * No es un capricho. Es cómo vas a descubrir en qué tipos de pieza
 * Ollama ya te alcanza, para moverlas al motor gratis con criterio en
 * lugar de por corazonada.
 */
export async function comparar(pedido, { contexto = "" } = {}) {
  const est = await ollama.estado();

  const [conClaude, conOllama] = await Promise.all([
    preguntar(`${pedido}\n\nDevolvé sólo el texto pedido.`, { contexto })
      .catch((e) => `(el motor Claude falló: ${e.message})`),
    est.activo
      ? ollama.generar(`${pedido}\n\nDevolvé sólo el texto pedido.`, {
          sistema: "Escribís para AgroTitan. Español rioplatense con voseo, sobrio y técnico.",
        }).catch((e) => `(Ollama falló: ${e.message})`)
      : Promise.resolve(`(Ollama no está disponible: ${est.motivo})`),
  ]);

  return { claude: conClaude, ollama: conOllama, ollamaDisponible: est.activo };
}
