/* ═══════════════════════════════════════════════════════════════════
   PLANTILLA · el motor de plantillas, en cincuenta líneas.

   No usamos una librería porque no hace falta: el proyecto sólo
   necesita sustituir valores, repetir listas y mostrar u ocultar
   bloques. Eso entra en un archivo y se entiende de una lectura.

   Sintaxis
     {{clave}}            valor, escapado para HTML
     {{{clave}}}          valor crudo, sin escapar (para HTML propio)
     {{#lista}}...{{/}}   repite el bloque por cada elemento
     {{?clave}}...{{/}}   muestra el bloque sólo si el valor es cierto
     {{^clave}}...{{/}}   muestra el bloque sólo si el valor es falso

   Dentro de un bloque {{#lista}} el punto solo — {{.}} — es el
   elemento actual, y las claves se buscan primero en el elemento y
   después en el contexto de afuera.
   ═══════════════════════════════════════════════════════════════════ */

/** Escapa lo que va a entrar en HTML. Sin esto, un apóstrofo rompe la página. */
export function escapar(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Busca "a.b.c" dentro de una pila de contextos, del más cercano al más lejano. */
function buscar(pila, clave) {
  if (clave === ".") return pila[0];
  for (const ctx of pila) {
    if (ctx === null || typeof ctx !== "object") continue;
    let v = ctx;
    let encontrado = true;
    for (const parte of clave.split(".")) {
      if (v !== null && typeof v === "object" && parte in v) v = v[parte];
      else { encontrado = false; break; }
    }
    if (encontrado) return v;
  }
  return undefined;
}

/**
 * ¿Este valor cuenta como "hay algo"?
 *
 * Sigue la intuición de JavaScript —vacío, nulo, false, "" y 0 son que
 * no hay— con una salvedad que importa: un arreglo vacío tampoco cuenta.
 * Sin esa regla, una pieza sin lista dibujaba un <ul> vacío.
 *
 * Que el 0 sea "no hay" es deliberado. Si alguna vez hace falta mostrar
 * un cero, se usa {{{clave}}} directo en vez de envolverlo en {{?clave}}.
 */
function hay(v) {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

/**
 * Rellena una plantilla.
 * @param {string} texto  la plantilla
 * @param {object} datos  el contexto
 * @returns {string}
 */
export function rellenar(texto, datos) {
  return render(texto, [datos]);
}

/* Un bloque se cierra con {{/}} o con {{/nombre}}. Como el cierre corto
   no dice a quién cierra, no alcanza con una expresión regular: hay que
   contar profundidad. Un {{?lista}} adentro de un {{#interior}} cerraba
   el bloque de afuera y la pieza salía repetida cuatro veces. */
function nuevaEtiqueta() {
  return /\{\{([#?^/])([\w.]*)\}\}/g;
}

/** Devuelve el cuerpo del bloque abierto en `desde` y dónde sigue el texto. */
function cortarBloque(texto, desde, clave) {
  const et = nuevaEtiqueta();
  et.lastIndex = desde;
  let profundidad = 1;
  let m;
  while ((m = et.exec(texto)) !== null) {
    if (m[1] === "/") {
      profundidad--;
      if (profundidad === 0) {
        return { cuerpo: texto.slice(desde, m.index), sigue: et.lastIndex };
      }
    } else {
      profundidad++;
    }
  }
  throw new Error(`La plantilla tiene un bloque {{${clave}}} sin cerrar.`);
}

function render(texto, pila) {
  const apertura = /\{\{([#?^])([\w.]+)\}\}/;
  let salida = "";
  let resto = texto;

  for (;;) {
    const m = apertura.exec(resto);
    if (!m) break;

    salida += valores(resto.slice(0, m.index), pila);

    const inicio = m.index + m[0].length;
    const { cuerpo, sigue } = cortarBloque(resto, inicio, m[2]);
    const valor = buscar(pila, m[2]);

    if (m[1] === "#") {
      const lista = Array.isArray(valor) ? valor : hay(valor) ? [valor] : [];
      salida += lista.map((item) => render(cuerpo, [item, ...pila])).join("");
    } else if (m[1] === "?") {
      salida += hay(valor) ? render(cuerpo, pila) : "";
    } else {
      salida += hay(valor) ? "" : render(cuerpo, pila);
    }

    resto = resto.slice(sigue);
  }

  return salida + valores(resto, pila);
}

/** Sustituye los valores sueltos. Primero los crudos, después los escapados. */
function valores(texto, pila) {
  return texto
    .replace(/\{\{\{([\w.]+|\.)\}\}\}/g, (_, c) => {
      const v = buscar(pila, c);
      return v === undefined || v === null ? "" : String(v);
    })
    .replace(/\{\{([\w.]+|\.)\}\}/g, (_, c) => escapar(buscar(pila, c)));
}

/**
 * Lista los marcadores que quedaron sin resolver en un texto ya rellenado.
 * Sirve como red de seguridad del constructor: si esto devuelve algo,
 * la plantilla y los datos no coinciden.
 */
export function marcadoresSinResolver(texto) {
  const encontrados = texto.match(/\{\{[^}]+\}\}/g) || [];
  return [...new Set(encontrados)];
}
