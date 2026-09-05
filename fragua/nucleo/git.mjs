/* ═══════════════════════════════════════════════════════════════════
   GIT · el único lugar del proyecto que habla con git.

   Esto vivía adentro de sitio/publicar.mjs. Salió acá cuando apareció
   el respaldo, que necesita exactamente lo mismo: agregar, commitear y
   empujar reintentando. Dos copias del reintento se habrían
   desincronizado a la primera corrección, y el que quedara viejo
   fallaría justo el día que se corta la red.
   ═══════════════════════════════════════════════════════════════════ */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { REPO } from "./marca.mjs";

const ejecutar = promisify(execFile);

/** Corre git dentro del repositorio y devuelve su salida. */
export async function git(...args) {
  const { stdout } = await ejecutar("git", args, { cwd: REPO, maxBuffer: 10 << 20 });
  return stdout;
}

/** La rama en la que estamos parados. */
export async function ramaActual() {
  return (await git("branch", "--show-current")).trim();
}

/** Los archivos con cambios sin commitear, dentro de las rutas dadas. */
export async function sinCommitear(rutas) {
  // --porcelain da una línea por archivo, con dos caracteres de estado
  // adelante. Nos alcanza con los nombres.
  const salida = await git("status", "--porcelain", "--", ...rutas);
  return salida
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3).trim())
    // Un renombrado sale como "viejo -> nuevo": nos quedamos con el nuevo.
    .map((n) => (n.includes(" -> ") ? n.split(" -> ")[1] : n));
}

/**
 * Agrega, commitea y empuja, reintentando el push.
 *
 * La red del campo se corta, y perder el push después de haber hecho el
 * commit deja el trabajo a medias sin que nadie se entere. Cuatro
 * intentos con espera creciente: 2, 4, 8 y 16 segundos.
 */
export async function empujar(mensaje, rutas) {
  const rama = await ramaActual();

  await git("add", "--", ...rutas);

  const pendiente = await git("diff", "--cached", "--name-only");
  if (!pendiente.trim()) return { rama, sinCambios: true, archivos: [] };

  const archivos = pendiente.split("\n").filter(Boolean);
  await git("commit", "-m", mensaje);

  let ultimoError;
  for (let intento = 0; intento < 4; intento++) {
    try {
      await git("push", "-u", "origin", rama);
      return { rama, sinCambios: false, archivos };
    } catch (e) {
      ultimoError = e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** intento));
    }
  }

  throw new Error(
    `El commit quedó hecho pero el push falló cuatro veces.\n` +
    `Probá de nuevo con:  git push -u origin ${rama}\n\n${ultimoError?.message ?? ""}`
  );
}
