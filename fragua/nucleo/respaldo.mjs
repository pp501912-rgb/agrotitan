/* ═══════════════════════════════════════════════════════════════════
   RESPALDO · que no se pierda nada.

   FRAGUA escribe todo el tiempo dentro del repositorio —las notas que
   le mandás por Telegram, las transcripciones, el historial de lo
   publicado, el estado del banco de temas— pero hasta acá nada de eso
   se commiteaba. sitio/publicar.mjs sólo empujaba public/ y contenido/.
   Si la máquina se rompía, se perdía el resto.

   La regla que ordena esto:

     Lo que se puede volver a calcular se ignora.
     Lo que no, se versiona.

   Un PNG se rehace desde su ficha en dos segundos, así que las
   imágenes quedan fuera. Una nota de voz que dictaste manejando no se
   rehace con nada, así que va al repositorio.

   Con eso, cambiar de computadora es clonar, copiar el .env y correr
   npm run fuentes.
   ═══════════════════════════════════════════════════════════════════ */

import { sinCommitear, empujar } from "./git.mjs";

/* Relativas al repositorio, que es donde corre git.

   salida/ entra entero a propósito: el .gitignore ya excluye los PNG,
   así que lo que llega son las fichas y los copys. Nombrar acá los
   archivos uno por uno sería una segunda lista que mantener. */
const RUTAS_RESPALDO = [
  "fragua/conocimiento/",
  "fragua/contenido/",
  "fragua/salida/",
];

/** true salvo que lo hayas apagado con FRAGUA_RESPALDO=manual. */
export function automatico() {
  return (process.env.FRAGUA_RESPALDO || "auto").toLowerCase() !== "manual";
}

/** Qué hay sin respaldar ahora mismo. */
export async function pendiente() {
  try {
    const archivos = await sinCommitear(RUTAS_RESPALDO);
    return { total: archivos.length, archivos };
  } catch (e) {
    // Sin git —una copia bajada como zip— el respaldo no aplica y la
    // app tiene que arrancar igual.
    return { total: 0, archivos: [], error: e.message };
  }
}

/**
 * Commitea y empuja lo que haya.
 *
 * Nunca lanza: se llama al cerrar la app, y una excepción ahí sólo
 * lograría que el último mensaje que ves sea un volcado de pila.
 */
export async function respaldar(motivo = "a mano") {
  const hay = await pendiente();
  if (hay.error) return { respaldado: false, motivo: `Git no respondió: ${hay.error}` };
  if (!hay.total) return { respaldado: false, sinCambios: true };

  const fecha = new Date().toISOString().slice(0, 16).replace("T", " ");
  const mensaje =
    `Respaldo de FRAGUA · ${fecha}\n\n` +
    `${hay.total} archivo(s) de conocimiento, contenido y piezas.\n` +
    `Disparado: ${motivo}.`;

  try {
    const r = await empujar(mensaje, RUTAS_RESPALDO);
    if (r.sinCambios) return { respaldado: false, sinCambios: true };
    return { respaldado: true, rama: r.rama, total: r.archivos.length };
  } catch (e) {
    return { respaldado: false, motivo: e.message };
  }
}

/** La frase para el cartel de arranque, o null si no hay nada que decir. */
export async function aviso() {
  const hay = await pendiente();
  if (!hay.total) return null;

  return (
    `Tenés ${hay.total} archivo(s) sin respaldar. ` +
    (automatico()
      ? "Se van a empujar solos cuando cierres con Ctrl+C."
      : "El respaldo automático está apagado: usá el botón en Estado.")
  );
}
