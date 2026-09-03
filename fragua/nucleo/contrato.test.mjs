/* Pruebas del contrato de salida.  node --test nucleo/contrato.test.mjs

   La más importante de todas es la de la regla de oro: es la que evita
   que una cifra inventada llegue a publicarse. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { revisar, extraerJson } from "./contrato.mjs";

/** Una pieza válida mínima, para partir de algo que pasa. */
function piezaBase(cambios = {}) {
  return {
    formato: "placa",
    plantilla: "dato",
    audiencia: "inversor",
    tema: "nogal-anos-improductivos",
    titular: "En nogal, los años improductivos definen el repago",
    placas: [{
      n: 1,
      titulo: "Años improductivos iniciales",
      texto: "Antes del primer ingreso hay que sostener implantación y mantenimiento.",
    }],
    caption:
      "Antes del primer ingreso hay que sostener implantación y mantenimiento. " +
      "Ese tramo, y no el rinde de régimen pleno, es el que define el período de " +
      "repago. Es la clase de diferencia que no aparece en el margen bruto y sí " +
      "en el flujo de fondos.",
    hashtags: ["nogal", "fruticultura", "factibilidad", "margenbruto",
               "flujodefondos", "agronegocios", "agroargentina", "frutalesecos"],
    cta: "Si estás evaluando un proyecto, escribinos.",
    faltantes: [],
    fuentes: ["conocimiento/temas.json"],
    ...cambios,
  };
}

test("una pieza bien armada pasa", () => {
  const { pieza, problemas } = revisar(piezaBase());
  assert.deepEqual(problemas, []);
  assert.equal(pieza.tema, "nogal-anos-improductivos");
});

test("LA REGLA DE ORO · corchetes sin reportar se rechaza", () => {
  // Un marcador de un solo carácter cuenta. "[X]" es el más común del
  // proyecto y una versión anterior del patrón lo dejaba pasar.
  const { pieza, problemas } = revisar(piezaBase({
    caption: "Llevamos [X] años evaluando proyectos agropecuarios en cuatro países " +
             "y esta es la cuenta que hacemos antes de cada decisión de inversión. " +
             "El rinde de régimen pleno es el número que todos miran; el tramo " +
             "anterior es el que define cuándo vuelve el capital.",
  }));
  assert.equal(pieza, null);
  assert.match(problemas.join(" "), /regla de oro/);
});

test("LA REGLA DE ORO · corchetes reportados se aceptan", () => {
  const { problemas } = revisar(piezaBase({
    caption: "Llevamos [X] años evaluando proyectos agropecuarios en cuatro países " +
             "y esta es la cuenta que hacemos antes de cada decisión de inversión. " +
             "El rinde de régimen pleno es el número que todos miran; el tramo " +
             "anterior es el que define cuándo vuelve el capital.",
    faltantes: ["años de trayectoria"],
  }));
  assert.deepEqual(problemas, []);
});

test("LA REGLA DE ORO · también mira dentro de las placas", () => {
  const { problemas } = revisar(piezaBase({
    placas: [{ n: 1, titulo: "Trayectoria", texto: "[X] proyectos evaluados." }],
  }));
  assert.match(problemas.join(" "), /regla de oro/);
});

test("una pieza sin faltantes declarados y sin corchetes no se molesta", () => {
  const { problemas } = revisar(piezaBase({ faltantes: undefined }));
  assert.deepEqual(problemas, []);
});

test("rechaza una audiencia que no es ninguna de las dos", () => {
  const { problemas } = revisar(piezaBase({ audiencia: "ambos" }));
  assert.match(problemas.join(" "), /promediar/);
});

test("el carrusel exige entre 4 y 8 placas", () => {
  const dos = revisar(piezaBase({ formato: "carrusel", plantilla: "carrusel",
    placas: [{ n: 1, texto: "una" }, { n: 2, texto: "dos" }] }));
  assert.match(dos.problemas.join(" "), /entre 4 y 8/);

  const cinco = revisar(piezaBase({
    formato: "carrusel", plantilla: "carrusel",
    placas: Array.from({ length: 5 }, (_, i) => ({ n: i + 1, titulo: `T${i}`, texto: "texto de la placa" })),
  }));
  assert.deepEqual(cinco.problemas, []);
});

test("exige entre 8 y 15 hashtags y sin numeral", () => {
  assert.match(revisar(piezaBase({ hashtags: ["uno", "dos"] })).problemas.join(" "), /entre 8 y 15/);
  assert.match(revisar(piezaBase({ hashtags: ["#nogal", "b", "c", "d", "e", "f", "g", "h"] })).problemas.join(" "), /sin el numeral/);
});

test("no deja publicar sin fuentes", () => {
  assert.match(revisar(piezaBase({ fuentes: [] })).problemas.join(" "), /fuentes/);
});

test("marca los textos que no entran en la placa", () => {
  const { problemas } = revisar(piezaBase({
    placas: [{ n: 1, titulo: "T", texto: "x".repeat(260) }],
  }));
  assert.match(problemas.join(" "), /entran 220/);
});

test("normaliza los hashtags que igual vinieron con numeral", () => {
  const { pieza } = revisar(piezaBase({
    hashtags: ["nogal", "fruticultura", "factibilidad", "margenbruto",
               "flujodefondos", "agronegocios", "agroargentina", "frutalesecos"],
  }));
  assert.ok(pieza.hashtags.every((t) => !t.startsWith("#")));
});

test("extraerJson sobrevive a los envoltorios del modelo", () => {
  assert.deepEqual(extraerJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extraerJson('Claro, acá va:\n{"a":1}'), { a: 1 });
  assert.deepEqual(extraerJson('{"a":1}'), { a: 1 });
  assert.equal(extraerJson("sin json"), null);
});
