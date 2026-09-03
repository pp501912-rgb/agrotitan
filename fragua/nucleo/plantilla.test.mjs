/* Pruebas del motor de plantillas.  Correlas con:  node --test nucleo/
   No hay dependencias: el corredor de pruebas viene con Node. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { rellenar, escapar, marcadoresSinResolver } from "./plantilla.mjs";

test("sustituye valores y respeta el escapado", () => {
  assert.equal(rellenar("Hola {{quien}}", { quien: "mundo" }), "Hola mundo");
  assert.equal(rellenar("{{a}}", { a: '<b>&"' }), "&lt;b&gt;&amp;&quot;");
  assert.equal(rellenar("{{{a}}}", { a: '<b>&"' }), '<b>&"');
  assert.equal(rellenar("{{falta}}", {}), "");
});

test("resuelve claves anidadas con punto", () => {
  assert.equal(rellenar("{{a.b.c}}", { a: { b: { c: "hondo" } } }), "hondo");
});

test("repite listas y expone el elemento como punto", () => {
  assert.equal(rellenar("{{#l}}[{{.}}]{{/}}", { l: ["a", "b"] }), "[a][b]");
  assert.equal(rellenar("{{#l}}{{n}} {{/}}", { l: [{ n: 1 }, { n: 2 }] }), "1 2 ");
});

test("dentro de una lista se ve el contexto de afuera", () => {
  assert.equal(rellenar("{{#l}}{{.}}{{f}} {{/}}", { l: ["a"], f: "F" }), "aF ");
});

test("muestra y oculta según el valor", () => {
  assert.equal(rellenar("{{?x}}SI{{/}}{{^x}}NO{{/}}", { x: true }), "SI");
  assert.equal(rellenar("{{?x}}SI{{/}}{{^x}}NO{{/}}", { x: false }), "NO");
  assert.equal(rellenar("{{?x}}SI{{/}}{{^x}}NO{{/}}", {}), "NO");
});

test("un arreglo vacío cuenta como que no hay nada", () => {
  // Este caso importa: sin él, una pieza sin lista dibujaba un <ul> vacío.
  assert.equal(rellenar("{{?l}}SI{{/}}{{^l}}NO{{/}}", { l: [] }), "NO");
  assert.equal(rellenar("{{?s}}SI{{/}}{{^s}}NO{{/}}", { s: "" }), "NO");
});

test("los bloques anidados cierran donde corresponde", () => {
  // La versión anterior usaba una expresión regular y el {{/}} de adentro
  // cerraba el bloque de afuera: la placa del carrusel salía repetida
  // cuatro veces. Este es el caso que lo destapó.
  const t = "{{?a}}A{{?b}}B{{/}}{{?c}}C{{/}}fin{{/}}";
  assert.equal(rellenar(t, { a: true, b: true,  c: true }), "ABCfin");
  assert.equal(rellenar(t, { a: true, b: false, c: true }), "ACfin");
  assert.equal(rellenar(t, { a: false, b: true, c: true }), "");
});

test("el cero cuenta como que no hay valor", () => {
  assert.equal(rellenar("{{?n}}SI{{/}}{{^n}}NO{{/}}", { n: 0 }), "NO");
  assert.equal(rellenar("{{?n}}SI{{/}}{{^n}}NO{{/}}", { n: 1 }), "SI");
  // Para mostrar un cero de verdad se usa el valor directo.
  assert.equal(rellenar("{{n}}", { n: 0 }), "0");
});

test("acepta el cierre con nombre y el cierre corto", () => {
  assert.equal(rellenar("{{?a}}X{{/a}}", { a: 1 }), "X");
  assert.equal(rellenar("{{?a}}X{{/}}", { a: 1 }), "X");
});

test("avisa si un bloque quedó sin cerrar", () => {
  assert.throws(() => rellenar("{{?a}}X", { a: 1 }), /sin cerrar/);
});

test("delata los marcadores que quedaron sin resolver", () => {
  assert.deepEqual(marcadoresSinResolver("hola {{a}} y {{b}}"), ["{{a}}", "{{b}}"]);
  assert.deepEqual(marcadoresSinResolver("todo bien"), []);
});

test("escapar deja pasar el vacío sin romperse", () => {
  assert.equal(escapar(null), "");
  assert.equal(escapar(undefined), "");
  assert.equal(escapar(0), "0");
});
