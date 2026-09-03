/* Pruebas del calendario editorial.  node --test nucleo/calendario.test.mjs

   `proponer` lee el banco de temas real del proyecto, así que estas
   pruebas también actúan de red: si alguien deja temas.json con un
   tema sin audiencia o sin rubro, el plan sale mal y se nota acá. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { diasDePublicacion, proponer } from "./calendario.mjs";

test("los días de publicación caen en martes y jueves", () => {
  // Octubre de 2026: el 1 es jueves.
  const dias = diasDePublicacion(2026, 10);
  assert.equal(dias[0], "2026-10-01");

  for (const d of dias) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    assert.ok(dow === 2 || dow === 4, `${d} cae en día ${dow}, no es martes ni jueves`);
  }
});

test("acepta otros días de la semana", () => {
  const lunes = diasDePublicacion(2026, 10, { diasSemana: [1] });
  assert.ok(lunes.length >= 3);
  for (const d of lunes) {
    assert.equal(new Date(`${d}T00:00:00Z`).getUTCDay(), 1);
  }
});

test("no se sale del mes pedido", () => {
  for (const mes of [1, 2, 6, 12]) {
    for (const d of diasDePublicacion(2026, mes)) {
      assert.equal(d.slice(0, 7), `2026-${String(mes).padStart(2, "0")}`);
    }
  }
});

test("febrero de un año bisiesto llega hasta el 29", () => {
  const dias = diasDePublicacion(2028, 2, { diasSemana: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(dias.length, 29);
  assert.equal(dias.at(-1), "2028-02-29");
});

test("el plan alterna audiencia y rubro entre piezas seguidas", async () => {
  const r = await proponer(2026, 10);
  assert.ok(r.plan.length > 3, "el banco tendría que dar para varias piezas");

  // La alternancia es un objetivo, no una garantía: cuando el banco se
  // agota el planificador afloja antes que dejar el día vacío. Lo que
  // sí exigimos es que no afloje al principio, con temas de sobra.
  for (let i = 1; i < Math.min(r.plan.length, 6); i++) {
    const a = r.plan[i - 1], b = r.plan[i];
    assert.notEqual(b.audiencia, a.audiencia, `${b.fecha} repite audiencia`);
    assert.notEqual(b.rubro, a.rubro, `${b.fecha} repite rubro`);
  }
});

test("no propone dos veces el mismo tema", async () => {
  const r = await proponer(2026, 10);
  const ids = r.plan.map((e) => e.tema);
  assert.equal(new Set(ids).size, ids.length);
});

test("cada propuesta trae lo que la pieza necesita para armarse", async () => {
  const r = await proponer(2026, 10);
  for (const e of r.plan) {
    assert.ok(e.fecha && e.tema && e.titulo, `entrada incompleta: ${JSON.stringify(e)}`);
    assert.ok(["inversor", "productor"].includes(e.audiencia), `audiencia rara en ${e.tema}`);
    assert.ok(Array.isArray(e.necesita));
  }
});

test("avisa con números cuando el banco no alcanza", async () => {
  // Todos los días de un mes largo: seguro supera los temas disponibles.
  const r = await proponer(2026, 10, { diasSemana: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(r.alcanza, false);
  assert.match(r.nota, /\d+ de los \d+ días/);
  assert.ok(r.propuestas < r.diasDisponibles);
});
