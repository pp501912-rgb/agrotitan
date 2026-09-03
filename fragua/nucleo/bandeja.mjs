/* ═══════════════════════════════════════════════════════════════════
   BANDEJA · el lado de tu PC.

   Baja lo que quedó en la cola de Cloudflare, lo archiva en
   conocimiento/notas/ y borra de la cola sólo lo que archivó.

   Se ejecuta sola al arrancar el servidor. Si no configuraste la
   bandeja, no hace nada y no molesta.
   ═══════════════════════════════════════════════════════════════════ */

import { guardarNota } from "./conocimiento.mjs";

/** ¿Está configurada? */
export function configurada() {
  return Boolean(process.env.BANDEJA_URL && process.env.BANDEJA_TOKEN);
}

/**
 * Trae lo pendiente, lo archiva y limpia la cola.
 * Nunca lanza: si la bandeja no responde, la app arranca igual.
 */
export async function bajar() {
  if (!configurada()) return { configurada: false };

  const base = process.env.BANDEJA_URL.replace(/\/$/, "");
  const cabeceras = { "x-bandeja-token": process.env.BANDEJA_TOKEN };

  try {
    const r = await fetch(`${base}/api/cola`, { headers: cabeceras, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return { configurada: true, error: `La bandeja respondió ${r.status}.` };

    const { capturas = [] } = await r.json();
    if (!capturas.length) return { configurada: true, bajadas: 0 };

    // Archivamos primero y borramos después, y sólo lo que se archivó.
    // Al revés, un corte de luz en el medio perdería las capturas.
    const archivadas = [];
    for (const c of capturas) {
      try {
        await guardarNota(c.titulo || "Captura del celular", c.texto || "", "bandeja");
        archivadas.push(c.clave);
      } catch { /* esta no se pudo: queda en la cola para el próximo intento */ }
    }

    if (archivadas.length) {
      await fetch(`${base}/api/vaciar`, {
        method: "POST",
        headers: { ...cabeceras, "content-type": "application/json" },
        body: JSON.stringify({ claves: archivadas }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => { /* quedan en la cola; se archivarían de nuevo, no se pierde nada */ });
    }

    return { configurada: true, bajadas: archivadas.length, quedaron: capturas.length - archivadas.length };
  } catch (e) {
    return { configurada: true, error: e.message };
  }
}
