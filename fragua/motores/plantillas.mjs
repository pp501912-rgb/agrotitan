/* ═══════════════════════════════════════════════════════════════════
   MOTOR PLANTILLAS · sin IA, sin costo, sin latencia.

   Estructuras de copy ya probadas que se rellenan con los datos del
   tema. El resultado es predecible y siempre está en tono de marca,
   porque el tono lo puso quien escribió la estructura.

   Sirve para dos cosas:
     · Piezas repetitivas, donde la variación no aporta.
     · Red de seguridad: si no hay clave de Claude ni Ollama, la app
       igual produce algo publicable.

   Nunca inventa un dato. Lo que no está en el tema queda entre
   corchetes y se reporta, igual que en los otros dos motores.
   ═══════════════════════════════════════════════════════════════════ */

import { CONTACTO } from "../nucleo/marca.mjs";

/** Este motor siempre está disponible: es código. */
export function estado() {
  return { activo: true };
}

/* ── Los esqueletos ────────────────────────────────────────────────
   Cada uno resuelve una forma de contar. El {angulo} del tema es lo
   que los llena, así que el resultado cambia con el tema aunque la
   estructura sea la misma.
   ────────────────────────────────────────────────────────────────── */

const ESQUELETOS = {
  /** La variable escondida: lo que todos miran vs. lo que decide. */
  variableEscondida: {
    plantilla: "dato",
    formato: "placa",
    arma: (t) => ({
      titular: t.titulo,
      placas: [{
        n: 1,
        titulo: t.titulo,
        texto: t.angulo,
        destacado: "El promedio no decide. La estructura del flujo, sí.",
      }],
      caption:
        `${t.angulo}\n\n` +
        `Es la clase de diferencia que no aparece en el margen bruto y sí en el ` +
        `flujo de fondos. Por eso el análisis técnico y el financiero se hacen ` +
        `sobre el mismo modelo, y no uno después del otro.\n\n` +
        `${cierre(t.audiencia)}`,
    }),
  },

  /** Pregunta incómoda arriba, respuesta metodológica abajo. */
  preguntaIncomoda: {
    plantilla: "cita",
    formato: "placa",
    arma: (t) => ({
      titular: t.titulo,
      placas: [{ n: 1, titulo: t.titulo, texto: t.angulo }],
      caption:
        `${t.angulo}\n\n` +
        `No es una pregunta retórica: es una de las que hay que contestar antes ` +
        `de comprometer capital, y la respuesta cambia el resultado.\n\n` +
        `${cierre(t.audiencia)}`,
    }),
  },

  /** El método, repartido en placas. */
  desarrollo: {
    plantilla: "carrusel",
    formato: "carrusel",
    arma: (t) => ({
      titular: t.titulo,
      placas: [
        { n: 1, titulo: t.titulo, texto: t.angulo },
        { n: 2, titulo: "Qué se mide", texto: "Aptitud de suelo, agua disponible, clima de la zona y tecnología aplicable. De ahí sale el rendimiento esperado." },
        { n: 3, titulo: "Qué deja por año", texto: "Precios de referencia y costos directos aplicados sobre ese rendimiento. Produce el margen bruto, en la unidad que manda en cada caso." },
        { n: 4, titulo: "Si conviene inmovilizar el capital", texto: "Flujo de fondos de toda la vida del proyecto, medido con VAN, TIR y período de repago." },
        { n: 5, titulo: "Y dónde deja de cerrar", texto: "El análisis de sensibilidad muestra el borde: a qué precio, con qué rinde, el proyecto ya no conviene.", destacado: "El informe es la prueba escrita de la decisión." },
      ],
      caption:
        `${t.angulo}\n\n` +
        `Los tres estudios están encadenados: el resultado de cada uno alimenta ` +
        `al siguiente. El rendimiento que estima el agrónomo es exactamente el ` +
        `número que entra en el flujo de fondos.\n\n` +
        `${cierre(t.audiencia)}`,
    }),
  },
};

function cierre(audiencia) {
  return audiencia === "productor"
    ? "Si estás pensando en cambiar algo en tu campo y querés el número antes de decidir, escribinos."
    : "Si estás evaluando un proyecto y querés saber en qué escenario deja de cerrar, escribinos.";
}

/** Qué esqueleto le corresponde a un formato pedido. */
function elegirEsqueleto(tema, formatoPedido) {
  const porFormato = {
    dato: "variableEscondida",
    cita: "preguntaIncomoda",
    carrusel: "desarrollo",
    servicio: "desarrollo",
  };
  return ESQUELETOS[porFormato[formatoPedido || tema.formato] || "variableEscondida"];
}

/**
 * Arma una pieza completa a partir de un tema del banco.
 * Devuelve el mismo contrato JSON que los otros dos motores.
 *
 * @param {object} tema      una entrada de conocimiento/temas.json
 * @param {object} opciones  { formato, hashtags }
 */
export function generarPieza(tema, { formato = null, hashtags = [] } = {}) {
  const esq = elegirEsqueleto(tema, formato);
  const cuerpo = esq.arma(tema);

  // Lo que el tema declara que le falta, se arrastra a la pieza: así el
  // panel puede avisar antes de que alguien la publique.
  const faltantes = (tema.necesita || []).slice();

  return {
    formato:   esq.formato,
    plantilla: esq.plantilla,
    audiencia: tema.audiencia,
    tema:      tema.id,
    titular:   cuerpo.titular,
    placas:    cuerpo.placas,
    caption:   `${cuerpo.caption}\n\n${CONTACTO.enlaceWa}`,
    hashtags,
    cta:       cierre(tema.audiencia),
    faltantes,
    fuentes:   [tema.fuente || "conocimiento/temas.json"],
  };
}

export const esqueletosDisponibles = Object.keys(ESQUELETOS);
