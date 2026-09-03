/* ═══════════════════════════════════════════════════════════════════
   MAPA DE DATOS · los 37 marcadores pendientes de la página.

   Cada <span class="falta"> de propuesta/index.html está acá, en el
   mismo orden en que aparece en el archivo, con:

     clave     el campo en contenido/datos.json
     espera    el texto exacto que hay hoy dentro del span
     pregunta  cómo se le pide el dato a una persona, en castellano
     seccion   dónde aparece, para agrupar el formulario
     formato   cómo se escribe el valor cuando está cargado

   Hay marcadores que aparecen dos veces en la página con distinta
   redacción —"[X semanas]" en la sección de etapas y "[X sem]" en la
   tabla de precios— y son el mismo dato. Comparten clave: se carga
   una vez y se completa en los dos lugares. Por eso el valor guarda
   sólo el número y la unidad la pone el formato.

   El extractor verifica que 'espera' coincida. Si alguien edita la
   maqueta y el texto cambia, falla y avisa cuál: nunca asigna mal un
   dato en silencio.
   ═══════════════════════════════════════════════════════════════════ */

export const MAPA = [
  // ── Hero · las cifras de apertura ───────────────────────────────
  { clave: "aniosTrayectoria", espera: "[X]", seccion: "Trayectoria",
    pregunta: "¿Cuántos años lleva el equipo evaluando proyectos agropecuarios?",
    formato: "{v}", ayuda: "Sólo el número. La palabra «años» ya está en la página." },

  { clave: "proyectosEvaluados", espera: "[X]", seccion: "Trayectoria",
    pregunta: "¿Cuántos proyectos evaluaron, técnica y financieramente?",
    formato: "{v}", ayuda: "Un número redondo está bien. Es prueba de volumen de trabajo real." },

  { clave: "hectareasAnalizadas", espera: "[X]", seccion: "Trayectoria",
    pregunta: "¿Cuántas hectáreas analizaron a campo?",
    formato: "{v}", ayuda: "Prueba de escala: le dice al visitante si su proyecto entra." },

  { clave: "inversionEvaluadaUSD", espera: "[X]", seccion: "Trayectoria",
    pregunta: "¿Cuánta inversión evaluaron, en millones de dólares?",
    formato: "{v}", ayuda: "Es la cifra que más le habla al inversor. Puede ir por rangos." },

  // ── Quiénes somos · credenciales colectivas ────────────────────
  { clave: "equipoComposicion", espera: "[X] ingenieros agrónomos y [X] zootecnistas",
    seccion: "El equipo",
    pregunta: "¿Cuántos son y de qué se recibieron?",
    formato: "{v}", ayuda: "Sin nombres propios. Por ejemplo: «3 ingenieros agrónomos y 2 zootecnistas»." },

  { clave: "equipoFormacion", espera: "[universidades de egreso]", seccion: "El equipo",
    pregunta: "¿En qué universidades se recibieron?",
    formato: "{v}", ayuda: "Las instituciones, sin decir quién se recibió dónde." },

  { clave: "equipoMatriculas", espera: "[colegio profesional y estado de matrícula]",
    seccion: "El equipo",
    pregunta: "¿En qué colegio profesional están matriculados y en qué estado?",
    formato: "{v}", ayuda: "Por ejemplo: «Colegio de Ingenieros Agrónomos de …, matrículas activas»." },

  { clave: "equipoEjercicio", espera: "[X] años combinados", seccion: "El equipo",
    pregunta: "¿Cuántos años de ejercicio profesional suman entre todos?",
    formato: "{v} años combinados", ayuda: "Sólo el número." },

  { clave: "equipoTerritorio", espera: "[provincias y regiones donde trabajaron]",
    seccion: "El equipo",
    pregunta: "¿En qué provincias y regiones trabajaron?",
    formato: "{v}", ayuda: "Nombrar provincias concretas es más creíble que decir «cuatro países»." },

  // ── Método · las definiciones metodológicas ────────────────────
  { clave: "monedaEvaluacion", espera: "[dólares constantes / pesos corrientes / ambos]",
    seccion: "Método",
    pregunta: "¿En qué moneda evalúan los proyectos?",
    formato: "{v}", ayuda: "Dólares constantes, pesos corrientes, o ambos. En Argentina esto define el resultado." },

  { clave: "tasaDescuento", espera: "[cómo se determina y contra qué alternativa se compara]",
    seccion: "Método",
    pregunta: "¿Cómo determinan la tasa de descuento y contra qué alternativa la comparan?",
    formato: "{v}", ayuda: "Es la variable que más mueve el VAN. Conviene que sea explícita." },

  { clave: "horizonteValorTerminal", espera: "[horizonte típico por rubro]",
    seccion: "Método",
    pregunta: "¿Qué horizonte de evaluación usan en cada rubro?",
    formato: "{v}", ayuda: "Por ejemplo: «20 años en frutales de vida larga, 10 en ganadería»." },

  { clave: "tratamientoImpositivo",
    espera: "[IVA, ganancias, retenciones, regímenes de promoción aplicables]",
    seccion: "Método",
    pregunta: "¿Qué impuestos y regímenes contemplan en el flujo?",
    formato: "{v}", ayuda: "Un flujo antes y uno después de impuestos son dos proyectos distintos." },

  { clave: "flujoEvaluado", espera: "[del proyecto, del inversionista, o ambos]",
    seccion: "Método",
    pregunta: "¿Evalúan el flujo del proyecto, el del inversionista, o los dos?",
    formato: "{v}", ayuda: "Con y sin financiamiento son dos TIR y responden dos preguntas distintas." },

  { clave: "fuentesDeDatos",
    espera: "[INTA, bolsas de cereales y comercio, ODEPA, series propias, datos del cliente]",
    seccion: "Método",
    pregunta: "¿De dónde salen los precios y rindes de referencia?",
    formato: "{v}", ayuda: "Declarar las fuentes es la diferencia entre un modelo y una opinión." },

  { clave: "tratamientoRiesgo",
    espera: "[sensibilidad determinista sobre las variables críticas / simulación con distribuciones]",
    seccion: "Método",
    pregunta: "¿Cómo tratan el riesgo?",
    formato: "{v}", ayuda: "Las dos formas son válidas. Decir cuál usan es lo que da confianza." },

  // ── El informe · qué recibe el cliente ─────────────────────────
  { clave: "informeAnexos", espera: "[otros anexos que entregan]", seccion: "El informe",
    pregunta: "¿Qué otros anexos entregan con el informe?",
    formato: "{v}", ayuda: "Además de análisis de laboratorio y documentación de respaldo." },

  { clave: "informePaginas", espera: "[X]", seccion: "El informe",
    pregunta: "¿Cuántas páginas tiene el informe, aproximadamente?",
    formato: "{v}", ayuda: "Sólo el número. Es de los datos que más convence al que duda." },

  { clave: "informeReunion", espera: "[¿presentación ante el banco?]", seccion: "El informe",
    pregunta: "¿La reunión de presentación incluye acompañar al banco?",
    formato: "{v}", ayuda: "Por ejemplo: «Sí, incluye presentación ante la entidad que financia»." },

  // ── Etapas y precios · cada dato aparece dos veces en la página ─
  { clave: "plazoFactibilidad", espera: "[X semanas]", seccion: "Etapas y precios",
    pregunta: "¿En cuántas semanas entregan el análisis de factibilidad?",
    formato: "{v} semanas", ayuda: "Sólo el número. Filtra al que tiene un apuro imposible." },

  { clave: "precioFactibilidad", espera: "[USD X]", seccion: "Etapas y precios",
    pregunta: "¿Desde cuántos dólares arranca el análisis de factibilidad?",
    formato: "USD {v}", ayuda: "Sólo el número. Podés publicar un «desde» en vez del rango completo." },

  { clave: "plazoLlaveEnMano", espera: "[X semanas]", seccion: "Etapas y precios",
    pregunta: "¿En cuántas semanas entregan el proyecto llave en mano?",
    formato: "{v} semanas", ayuda: "Sólo el número." },

  { clave: "precioLlaveEnMano", espera: "[USD X]", seccion: "Etapas y precios",
    pregunta: "¿Desde cuántos dólares arranca el proyecto llave en mano?",
    formato: "USD {v}", ayuda: "Sólo el número." },

  { clave: "modalidadAcompanamiento", espera: "[mensual / por campaña]", seccion: "Etapas y precios",
    pregunta: "¿El acompañamiento se contrata por mes o por campaña?",
    formato: "{v}", ayuda: "Puede ser una de las dos, o las dos." },

  { clave: "precioAcompanamiento", espera: "[USD X]", seccion: "Etapas y precios",
    pregunta: "¿Desde cuántos dólares arranca el acompañamiento?",
    formato: "USD {v}", ayuda: "Sólo el número." },

  { clave: "criterioValuacion", espera: "[norma o criterio profesional aplicado]",
    seccion: "Etapas y precios",
    pregunta: "¿Bajo qué norma o criterio profesional emiten una valuación de campo?",
    formato: "{v}", ayuda: "Es lo que decide si el informe sirve como respaldo formal ante un tercero." },

  // ── Rubros ─────────────────────────────────────────────────────
  { clave: "escalaProyectos", espera: "[rango de superficie o de inversión]", seccion: "Rubros",
    pregunta: "¿Con qué escala de proyectos trabajan?",
    formato: "{v}", ayuda: "Por ejemplo: «desde 20 hasta 2.000 hectáreas». Ubica al visitante." },

  // ── Tabla de precios · repiten los datos de arriba ─────────────
  { clave: "plazoFactibilidad", espera: "[X sem]", seccion: "Etapas y precios", formato: "{v} sem" },
  { clave: "precioFactibilidad", espera: "[USD X]", seccion: "Etapas y precios", formato: "USD {v}" },
  { clave: "plazoLlaveEnMano", espera: "[X sem]", seccion: "Etapas y precios", formato: "{v} sem" },
  { clave: "precioLlaveEnMano", espera: "[USD X]", seccion: "Etapas y precios", formato: "USD {v}" },
  { clave: "modalidadAcompanamiento", espera: "[mensual]", seccion: "Etapas y precios", formato: "{v}" },
  { clave: "precioAcompanamiento", espera: "[USD X]", seccion: "Etapas y precios", formato: "USD {v}" },

  { clave: "plazoValuacion", espera: "[X sem]", seccion: "Etapas y precios",
    pregunta: "¿En cuántas semanas entregan una valuación de campo?",
    formato: "{v} sem", ayuda: "Sólo el número." },

  { clave: "precioValuacion", espera: "[USD X]", seccion: "Etapas y precios",
    pregunta: "¿Desde cuántos dólares arranca una valuación de campo?",
    formato: "USD {v}", ayuda: "Sólo el número." },

  // ── Contacto ───────────────────────────────────────────────────
  { clave: "correo", espera: "[correo con dominio propio]", seccion: "Contacto",
    pregunta: "¿Cuál es el correo con dominio propio?",
    formato: "{v}",
    ayuda: "El Gmail personal es fricción de confianza pura. Si la casilla todavía no existe, conviene crearla antes de publicar." },

  { clave: "territorioConcreto", espera: "[provincias y regiones concretas]", seccion: "Contacto",
    pregunta: "¿En qué provincias y regiones concretas trabajan?",
    formato: "{v}", ayuda: "Más creíble que nombrar cuatro países enteros." },
];

/**
 * El mismo mapa con un `id` único por aparición.
 *
 * Hace falta porque un dato sale dos veces en la página con distinta
 * redacción: el plazo de factibilidad es "[X semanas]" en la sección de
 * etapas y "[X sem]" en la tabla de precios. Comparten `clave` —se
 * cargan una sola vez— pero cada aparición necesita su propio marcador
 * en la plantilla, porque el formato y el texto de relleno difieren.
 *
 * La segunda aparición de una clave queda como `clave_2`, la tercera
 * como `clave_3`, y así.
 */
export function conIds() {
  const cuenta = new Map();
  return MAPA.map((e) => {
    const n = (cuenta.get(e.clave) || 0) + 1;
    cuenta.set(e.clave, n);
    return { ...e, id: n === 1 ? e.clave : `${e.clave}_${n}` };
  });
}

/** Las claves únicas, en el orden en que conviene completarlas. */
export function clavesÚnicas() {
  const vistas = new Set();
  const salida = [];
  for (const e of MAPA) {
    if (vistas.has(e.clave)) continue;
    vistas.add(e.clave);
    salida.push(e);
  }
  return salida;
}

/** Aplica el formato de un marcador a un valor cargado. */
export function formatear(entrada, valor) {
  return (entrada.formato || "{v}").replace("{v}", valor);
}
