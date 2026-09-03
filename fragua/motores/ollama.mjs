/* ═══════════════════════════════════════════════════════════════════
   MOTOR OLLAMA · el que corre en tu PC, gratis y sin internet.

   Se usa para el trabajo de volumen donde el error se descarta:
   veinte variantes de titular para elegir una, reescribir un párrafo
   más corto, digerir tus notas, buscar en el conocimiento.

   No se usa para el bucle de conversación ni para el texto final que
   se publica. Un modelo de 8 mil millones de parámetros se confunde
   seguido al llamar herramientas, y un CM que se equivoca de
   herramienta es peor que no tenerlo.

   No necesita librería: la API de Ollama es HTTP y Node ya trae fetch.
   ═══════════════════════════════════════════════════════════════════ */

const URL_BASE   = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODELO     = process.env.OLLAMA_MODELO || "qwen3:8b";
const EMBEDDINGS = process.env.OLLAMA_EMBEDDINGS || "nomic-embed-text";

/** ¿Está Ollama andando y con el modelo bajado? */
export async function estado() {
  try {
    const r = await fetch(`${URL_BASE}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { activo: false, motivo: `Ollama respondió ${r.status}.` };

    const { models = [] } = await r.json();
    const nombres = models.map((m) => m.name);
    const tiene = (n) => nombres.some((x) => x === n || x.startsWith(n.split(":")[0] + ":"));

    const faltan = [];
    if (!tiene(MODELO))     faltan.push(MODELO);
    if (!tiene(EMBEDDINGS)) faltan.push(EMBEDDINGS);

    if (faltan.length) {
      return {
        activo: false,
        motivo:
          `Ollama está andando pero falta bajar ${faltan.join(" y ")}. ` +
          `Corré:  ${faltan.map((m) => `ollama pull ${m}`).join("  &&  ")}`,
      };
    }
    return { activo: true, modelo: MODELO, embeddings: EMBEDDINGS };
  } catch {
    return {
      activo: false,
      motivo:
        `No encuentro Ollama en ${URL_BASE}. Instalalo de ollama.com y ` +
        `después corré:  ollama pull ${MODELO}  &&  ollama pull ${EMBEDDINGS}`,
    };
  }
}

/**
 * Genera texto. `formato: "json"` le pide a Ollama que devuelva JSON
 * válido, que es bastante más confiable que pedírselo en el prompt.
 */
export async function generar(prompt, { sistema = "", formato = null, temperatura = 0.7 } = {}) {
  const r = await fetch(`${URL_BASE}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      prompt,
      system: sistema || undefined,
      format: formato || undefined,
      stream: false,
      options: { temperature: temperatura },
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!r.ok) throw new Error(`Ollama devolvió ${r.status}: ${await r.text()}`);
  const { response } = await r.json();
  return (response || "").trim();
}

/**
 * Varias respuestas al mismo pedido, con temperatura alta.
 *
 * Es la primera mitad del modo cascada: acá salen ocho borradores
 * gratis y después Claude recibe los ocho en una sola llamada corta,
 * elige el mejor y lo pule. Se paga una llamada en lugar de ocho.
 */
export async function variantes(prompt, cuantas = 8, opciones = {}) {
  const pedidos = Array.from({ length: cuantas }, () =>
    generar(prompt, { ...opciones, temperatura: opciones.temperatura ?? 0.95 })
      .catch(() => null)
  );
  return (await Promise.all(pedidos)).filter(Boolean);
}

/** El vector de un texto, para buscar por significado y no por palabra. */
export async function embedding(texto) {
  const r = await fetch(`${URL_BASE}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: EMBEDDINGS, prompt: texto }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`Ollama devolvió ${r.status} al calcular el embedding.`);
  const { embedding: v } = await r.json();
  return v;
}

/** Similitud coseno. Devuelve entre -1 y 1; arriba de 0,82 es "muy parecido". */
export function coseno(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let punto = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    punto += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : punto / d;
}
