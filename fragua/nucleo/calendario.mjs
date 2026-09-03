/* ═══════════════════════════════════════════════════════════════════
   CALENDARIO · el plan editorial del mes.

   Vive en conocimiento/calendario.json y se edita a mano igual que
   todo lo demás. Cada entrada es una fecha, un tema del banco y un
   formato; nada más. La pieza se genera después, cuando le toca.

   Dos criterios que el planificador respeta y conviene tener escritos:

     · No dos piezas seguidas a la misma audiencia. El documento de
       alineación fue tajante con que inversor y productor van en
       carriles separados, y una cuenta que le habla sólo a uno pierde
       al otro.

     · No dos piezas seguidas del mismo rubro. Un banco de diecisiete
       temas alcanza para varios meses si se reparte.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

import { RUTAS } from "./marca.mjs";
import { leerTemas } from "./conocimiento.mjs";

const ARCHIVO = path.join(RUTAS.conocimiento, "calendario.json");

export async function leer() {
  try { return JSON.parse(await fs.readFile(ARCHIVO, "utf8")); }
  catch {
    return {
      _leeme:
        "Plan editorial. Cada entrada es una fecha, un tema del banco y un " +
        "formato. Editable a mano; la app lo relee sola.",
      actualizado: new Date().toISOString().slice(0, 10),
      entradas: [],
    };
  }
}

export async function guardar(cal) {
  cal.actualizado = new Date().toISOString().slice(0, 10);
  await fs.mkdir(RUTAS.conocimiento, { recursive: true });
  await fs.writeFile(ARCHIVO, JSON.stringify(cal, null, 2) + "\n", "utf8");
  return cal;
}

/* ── Fechas ────────────────────────────────────────────────────── */

/**
 * Los días de publicación de un mes.
 *
 * Por defecto martes y jueves: dos por semana sostenido vale más que
 * cinco una semana y ninguna la siguiente.
 */
export function diasDePublicacion(anio, mes, { diasSemana = [2, 4] } = {}) {
  const fechas = [];
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();

  for (let d = 1; d <= ultimo; d++) {
    const fecha = new Date(Date.UTC(anio, mes - 1, d));
    if (diasSemana.includes(fecha.getUTCDay())) {
      fechas.push(fecha.toISOString().slice(0, 10));
    }
  }
  return fechas;
}

/* ── Planificación ─────────────────────────────────────────────── */

/**
 * Propone un plan para un mes, repartiendo los temas sin usar.
 *
 * No escribe nada: devuelve la propuesta para que la mires. Agendar es
 * un paso aparte y explícito.
 */
export async function proponer(anio, mes, { diasSemana = [2, 4] } = {}) {
  const [{ temas = [] }, cal] = await Promise.all([leerTemas(), leer()]);

  const yaAgendados = new Set(cal.entradas.map((e) => e.tema));
  const disponibles = temas.filter(
    (t) => t.estado === "idea" && !yaAgendados.has(t.id)
  );

  // Los marcados como prioridad alta salen primero.
  disponibles.sort((a, b) => (b.prioridad === "alta") - (a.prioridad === "alta"));

  const fechas = diasDePublicacion(anio, mes, { diasSemana });
  const plan = [];
  const usados = new Set();

  for (const fecha of fechas) {
    const anterior = plan[plan.length - 1];

    // Primero buscamos uno que alterne audiencia y rubro. Si no hay,
    // aflojamos: es mejor publicar que dejar el día vacío.
    const elegido =
      disponibles.find((t) =>
        !usados.has(t.id) &&
        (!anterior || (t.audiencia !== anterior.audiencia && t.rubro !== anterior.rubro))) ||
      disponibles.find((t) => !usados.has(t.id));

    if (!elegido) break;

    usados.add(elegido.id);
    plan.push({
      fecha,
      tema: elegido.id,
      titulo: elegido.titulo,
      formato: elegido.formato,
      audiencia: elegido.audiencia,
      rubro: elegido.rubro,
      necesita: elegido.necesita || [],
      estado: "propuesto",
    });
  }

  return {
    anio, mes,
    diasDisponibles: fechas.length,
    propuestas: plan.length,
    temasSinUsar: disponibles.length,
    alcanza: plan.length >= fechas.length,
    plan,
    nota: plan.length < fechas.length
      ? `El banco da para ${plan.length} de los ${fechas.length} días del mes. ` +
        `Conviene sumar temas antes de completar el resto.`
      : null,
  };
}

/** Guarda un plan propuesto. Reemplaza lo que hubiera en esas fechas. */
export async function agendar(plan) {
  const cal = await leer();
  const fechas = new Set(plan.map((e) => e.fecha));

  cal.entradas = cal.entradas
    .filter((e) => !fechas.has(e.fecha))
    .concat(plan.map((e) => ({ ...e, estado: e.estado || "agendado" })))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  await guardar(cal);
  return { agendadas: plan.length, total: cal.entradas.length };
}

/** Lo que viene, de acá en adelante. */
export async function proximas(cuantas = 10) {
  const cal = await leer();
  const hoy = new Date().toISOString().slice(0, 10);
  return cal.entradas
    .filter((e) => e.fecha >= hoy && e.estado !== "publicado")
    .slice(0, cuantas);
}

/** Marca una fecha como ya resuelta. */
export async function marcar(fecha, estado) {
  const cal = await leer();
  const e = cal.entradas.find((x) => x.fecha === fecha);
  if (!e) return { marcada: false, motivo: `No hay nada agendado para el ${fecha}.` };
  e.estado = estado;
  await guardar(cal);
  return { marcada: true, fecha, estado };
}
