/* ═══════════════════════════════════════════════════════════════════
   HERRAMIENTAS · lo que HERALDO puede hacer además de hablar.

   Cada herramienta tiene su definición (lo que ve el modelo) y su
   implementación (lo que corre en tu PC). Casi todas son código puro:
   el modelo decide cuándo llamarlas, pero el trabajo lo hace Node.

   Ninguna herramienta publica ni manda nada afuera por su cuenta sin
   que vos lo pidas explícitamente. `publicar_sitio` es la única que
   toca el mundo, y exige confirmación.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

import { RUTAS, PLANTILLAS, AUDIENCIAS, CONTACTO } from "../nucleo/marca.mjs";
import { renderizar } from "../nucleo/render.mjs";
import { revisar } from "../nucleo/contrato.mjs";
import * as saber from "../nucleo/conocimiento.mjs";
import * as piezas from "../nucleo/piezas.mjs";
import * as calendario from "../nucleo/calendario.mjs";
import * as ollama from "../motores/ollama.mjs";
import * as cascada from "../motores/cascada.mjs";
import { leerDatos, pendientes, construir } from "../sitio/construir.mjs";
import { actualizarSitio, empujar, ramaActual } from "../sitio/publicar.mjs";

/* ═══ Definiciones · lo que ve el modelo ═════════════════════════ */

export const DEFINICIONES = [
  {
    name: "buscar_conocimiento",
    description:
      "Busca en las notas, el banco de temas y el glosario de AgroTitan. " +
      "Usala SIEMPRE antes de escribir sobre un tema: nunca escribas de memoria " +
      "sobre el negocio. Devuelve fragmentos con su procedencia, para poder citarla.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Qué buscar, en lenguaje natural." },
        cuantos: { type: "integer", description: "Cuántos fragmentos traer. Por defecto 6." },
      },
      required: ["consulta"],
      additionalProperties: false,
    },
  },
  {
    name: "listar_temas",
    description:
      "El banco de temas, con su estado. Sirve para proponer qué publicar sin " +
      "inventar de cero y para ver qué quedó pendiente.",
    input_schema: {
      type: "object",
      properties: {
        estado: { type: "string", description: "idea, borrador, aprobado, publicado o descartado." },
        rubro: { type: "string", description: "nogal, tambo, metodo, etc." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "revisar_repeticion",
    description:
      "Antes de producir una pieza, comprueba si ya publicamos algo parecido en " +
      "los últimos noventa días. Evita repetirse, que es el defecto más visible " +
      "de una cuenta manejada con automatismos.",
    input_schema: {
      type: "object",
      properties: { tema: { type: "string", description: "El id o el título del tema." } },
      required: ["tema"],
      additionalProperties: false,
    },
  },
  {
    name: "proponer_hashtags",
    description:
      "Arma el set de hashtags desde el catálogo curado: una capa de rubro, una " +
      "de disciplina y una de territorio. Nunca devuelve los genéricos prohibidos.",
    input_schema: {
      type: "object",
      properties: {
        rubro: { type: "string", description: "El rubro de la pieza." },
        territorio: {
          type: "array", items: { type: "string" },
          description: "agroargentina, agrochile, agrouruguay o agroparaguay.",
        },
      },
      required: ["rubro"],
      additionalProperties: false,
    },
  },
  {
    name: "variantes_locales",
    description:
      "Pide varios borradores al modelo local de Ollama, gratis y sin salir de " +
      "la PC. Usalo cuando necesites explorar opciones —ocho titulares para " +
      "elegir uno— en vez de escribirlas vos: sale gratis y después elegís y " +
      "puliís el mejor. Si Ollama no está instalado, avisa y no pasa nada.",
    input_schema: {
      type: "object",
      properties: {
        pedido: { type: "string", description: "Qué generar. Sé específico y breve." },
        cuantas: { type: "integer", description: "Cuántas variantes. Por defecto 8." },
      },
      required: ["pedido"],
      additionalProperties: false,
    },
  },
  {
    name: "guardar_pieza",
    description:
      "Valida una pieza contra el contrato de marca, la guarda en salida/ y " +
      "renderiza las imágenes 1080×1350. Mostrale el texto a la persona y esperá " +
      "su visto bueno ANTES de llamar a esto. Si la pieza no cumple el contrato, " +
      "devuelve la lista de problemas para que la corrijas y reintentes.",
    input_schema: {
      type: "object",
      properties: {
        formato:   { type: "string", enum: ["placa", "carrusel", "historia"] },
        plantilla: { type: "string", enum: PLANTILLAS },
        audiencia: { type: "string", enum: AUDIENCIAS },
        tema:      { type: "string", description: "Identificador en minúsculas con guiones." },
        titular:   { type: "string", description: "Máximo 90 caracteres." },
        placas: {
          type: "array",
          description: "Una si es placa, entre 4 y 8 si es carrusel.",
          items: {
            type: "object",
            properties: {
              n:         { type: "integer" },
              titulo:    { type: "string", description: "Hasta 60 caracteres." },
              texto:     { type: "string", description: "Hasta 220 caracteres." },
              destacado: { type: "string", description: "Remate en oro. Opcional." },
              lista:     { type: "array", items: { type: "string" } },
            },
            additionalProperties: false,
          },
        },
        caption:   { type: "string", description: "Entre 25 y 150 palabras." },
        hashtags:  { type: "array", items: { type: "string" }, description: "Entre 8 y 15, sin numeral." },
        cta:       { type: "string" },
        faltantes: {
          type: "array", items: { type: "string" },
          description: "Todo dato que dejaste entre corchetes. Si hay corchetes y esto va vacío, la pieza se rechaza.",
        },
        fuentes:   { type: "array", items: { type: "string" }, description: "De dónde salió cada afirmación. No puede ir vacío." },
      },
      required: ["formato", "plantilla", "audiencia", "tema", "titular", "placas", "caption", "hashtags", "cta", "fuentes"],
      additionalProperties: false,
    },
  },
  {
    name: "escribir_en_cascada",
    description:
      "Escribe un texto usando los dos motores: Ollama produce varios borradores " +
      "gratis en la PC y Claude elige el mejor y lo pule en una sola llamada. " +
      "Usalo para textos largos —un caption trabajado, el desarrollo de un " +
      "carrusel— donde explorar opciones vale la pena. Si Ollama no está " +
      "instalado, escribe igual y avisa que no hubo cascada.",
    input_schema: {
      type: "object",
      properties: {
        pedido:   { type: "string", description: "Qué escribir, en una o dos líneas." },
        criterio: { type: "string", description: "Con qué vara elegir el mejor borrador." },
        contexto: { type: "string", description: "Material del conocimiento que hay que usar." },
        cuantas:  { type: "integer", description: "Borradores locales. Por defecto 8." },
      },
      required: ["pedido"],
      additionalProperties: false,
    },
  },
  {
    name: "listar_piezas",
    description:
      "Las piezas ya generadas, con su estado: borrador, aprobada o publicada. " +
      "Sirve para saber qué hay pendiente de revisar y qué ya salió.",
    input_schema: {
      type: "object",
      properties: { estado: { type: "string", enum: ["borrador", "aprobada", "publicada"] } },
      additionalProperties: false,
    },
  },
  {
    name: "planificar_mes",
    description:
      "Propone un plan editorial repartiendo los temas sin usar: alterna " +
      "audiencia y rubro entre publicaciones seguidas. NO agenda nada: devuelve " +
      "la propuesta para que la persona la mire. Agendar es un paso aparte.",
    input_schema: {
      type: "object",
      properties: {
        anio: { type: "integer" },
        mes:  { type: "integer", description: "1 a 12." },
        diasSemana: {
          type: "array", items: { type: "integer" },
          description: "Días de publicación: 0 domingo, 1 lunes… Por defecto [2,4], martes y jueves.",
        },
      },
      required: ["anio", "mes"],
      additionalProperties: false,
    },
  },
  {
    name: "agendar_plan",
    description:
      "Guarda un plan en el calendario. Llamalo sólo después de que la persona " +
      "lo haya visto y aprobado.",
    input_schema: {
      type: "object",
      properties: {
        plan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fecha:     { type: "string", description: "AAAA-MM-DD" },
              tema:      { type: "string" },
              titulo:    { type: "string" },
              formato:   { type: "string" },
              audiencia: { type: "string" },
              rubro:     { type: "string" },
            },
            required: ["fecha", "tema"],
            additionalProperties: true,
          },
        },
      },
      required: ["plan"],
      additionalProperties: false,
    },
  },
  {
    name: "ver_calendario",
    description: "Lo que viene agendado de acá en adelante.",
    input_schema: {
      type: "object",
      properties: { cuantas: { type: "integer" } },
      additionalProperties: false,
    },
  },
  {
    name: "guardar_nota",
    description:
      "Archiva algo que la persona te contó y conviene recordar: una observación " +
      "de campaña, un criterio, un caso sin datos identificables. Es como crece " +
      "el conocimiento. Usala cuando te cuenten algo que no está en los archivos.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        texto:  { type: "string", description: "El contenido, en Markdown." },
      },
      required: ["titulo", "texto"],
      additionalProperties: false,
    },
  },
  {
    name: "estado_sitio",
    description:
      "Qué datos de la página siguen sin completar, de los 31. Mientras queden, " +
      "la página los muestra entre corchetes y el publicador se niega a subirla.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cargar_dato",
    description:
      "Completa uno de los datos pendientes de la página. Sólo con lo que la " +
      "persona te dice explícitamente: NUNCA lo deduzcas ni lo estimes.",
    input_schema: {
      type: "object",
      properties: {
        clave: { type: "string", description: "La clave exacta que devuelve estado_sitio." },
        valor: { type: "string", description: "El valor tal como lo dijo la persona." },
      },
      required: ["clave", "valor"],
      additionalProperties: false,
    },
  },
  {
    name: "publicar_sitio",
    description:
      "Reconstruye public/index.html, lo commitea y lo empuja a GitHub, de donde " +
      "Cloudflare lo toma. Es la única herramienta que toca el mundo de afuera: " +
      "pedí confirmación explícita antes de usarla. Con simulacro en true no " +
      "escribe nada y sólo informa qué cambiaría.",
    input_schema: {
      type: "object",
      properties: {
        simulacro:      { type: "boolean", description: "Por defecto true." },
        igualPublicar:  { type: "boolean", description: "Publicar aunque falten datos. Por defecto false." },
      },
      additionalProperties: false,
    },
  },
];

/* ═══ Implementaciones · lo que corre en tu PC ════════════════════ */

export const IMPLEMENTACIONES = {

  async buscar_conocimiento({ consulta, cuantos = 6 }) {
    const r = await saber.buscar(consulta, cuantos);
    if (!r.length) return { encontrado: 0, nota: "No hay nada sobre eso en el conocimiento. No lo inventes: preguntale a la persona o proponé guardar una nota." };
    return {
      encontrado: r.length,
      fragmentos: r.map((f) => ({ fuente: f.fuente, titulo: f.titulo, texto: f.texto.slice(0, 900), puntaje: Number(f.puntaje.toFixed(2)) })),
    };
  },

  async listar_temas({ estado, rubro } = {}) {
    const { temas = [] } = await saber.leerTemas();
    const filtrados = temas.filter((t) =>
      (!estado || t.estado === estado) && (!rubro || t.rubro === rubro));
    return {
      total: filtrados.length,
      temas: filtrados.map((t) => ({
        id: t.id, titulo: t.titulo, rubro: t.rubro, audiencia: t.audiencia,
        formato: t.formato, angulo: t.angulo, estado: t.estado,
        necesita: t.necesita || [], prioridad: t.prioridad || null,
      })),
    };
  },

  async revisar_repeticion({ tema }) {
    const { temas = [] } = await saber.leerTemas();
    const obj = temas.find((t) => t.id === tema) || tema;
    const parecidas = await saber.yaPublicamos(obj);
    return parecidas.length
      ? { repetido: true, avisar: "Decíselo a la persona antes de seguir.", parecidas }
      : { repetido: false };
  },

  async proponer_hashtags({ rubro, territorio }) {
    const tags = await saber.armarHashtags(rubro, territorio ? { territorio } : {});
    return { hashtags: tags, cuantos: tags.length };
  },

  async variantes_locales({ pedido, cuantas = 8 }) {
    const est = await ollama.estado();
    if (!est.activo) return { disponible: false, motivo: est.motivo };
    const v = await ollama.variantes(pedido, cuantas, {
      sistema: "Respondé sólo con lo pedido, sin explicaciones ni preámbulo. Español rioplatense, voseo, registro sobrio y técnico.",
    });
    return { disponible: true, cuantas: v.length, variantes: v };
  },

  async guardar_pieza(entrada) {
    const { pieza, problemas } = revisar(entrada);
    if (problemas.length) {
      return { guardada: false, problemas, nota: "Corregí estos puntos y volvé a llamar a guardar_pieza." };
    }

    const fecha = new Date().toISOString().slice(0, 10);
    const carpeta = path.join(RUTAS.salida, `${fecha}-${pieza.tema}`);
    await fs.mkdir(carpeta, { recursive: true });

    // El copy, listo para copiar y pegar en Instagram.
    const copy =
      `${pieza.caption}\n\n` +
      `${pieza.cta}\n${CONTACTO.enlaceWa}\n\n` +
      pieza.hashtags.map((t) => `#${t}`).join(" ") + "\n";
    await fs.writeFile(path.join(carpeta, "copy.txt"), copy, "utf8");

    // Las imágenes. Esto es código puro: no interviene ningún modelo.
    const imagenes = [];
    for (const [i, placa] of pieza.placas.entries()) {
      const esCarrusel = pieza.formato === "carrusel";
      const datos = {
        volanta: pieza.tema.replace(/-/g, " "),
        titular: placa.titulo || pieza.titular,
        subtitulo: placa.titulo,
        texto: placa.texto,
        destacado: placa.destacado,
        lista: placa.lista,
        nota: pieza.faltantes.length ? "Faltan datos" : "",
        ...(esCarrusel
          ? { tipo: i === 0 ? "portada" : i === pieza.placas.length - 1 ? "cierre" : "interior",
              n: i + 1, total: pieza.placas.length, accion: i === pieza.placas.length - 1 ? "Escribinos por WhatsApp" : "" }
          : {}),
      };
      const destino = path.join(carpeta, `${String(i + 1).padStart(2, "0")}.png`);
      await renderizar(pieza.plantilla, datos, destino);
      imagenes.push(path.basename(destino));
    }

    await fs.writeFile(
      path.join(carpeta, "ficha.json"),
      JSON.stringify({ ...pieza, fecha, creada: new Date().toISOString(),
                       estado: "borrador", imagenes }, null, 2) + "\n",
      "utf8"
    );

    return {
      guardada: true,
      carpeta: path.relative(RUTAS.salida, carpeta),
      imagenes,
      faltantes: pieza.faltantes,
      nota: pieza.faltantes.length
        ? "Ojo: la pieza tiene datos entre corchetes. No la publiques así."
        : "Lista para revisar y subir a mano.",
    };
  },

  async escribir_en_cascada({ pedido, criterio = "", contexto = "", cuantas = 8 }) {
    const r = await cascada.generar(pedido, { criterio, contexto, cuantas });
    return r.cascada
      ? { texto: r.texto, cascada: true, borradoresLocales: r.borradores,
          nota: `Ollama produjo ${r.borradores} borradores gratis y Claude eligió en una sola llamada.` }
      : { texto: r.texto, cascada: false, nota: `Sin cascada: ${r.motivo}` };
  },

  async listar_piezas({ estado } = {}) {
    const todas = await piezas.listar();
    const filtradas = estado ? todas.filter((p) => p.estado === estado) : todas;
    return { total: filtradas.length, piezas: filtradas };
  },

  async planificar_mes({ anio, mes, diasSemana }) {
    return calendario.proponer(anio, mes, diasSemana ? { diasSemana } : {});
  },

  async agendar_plan({ plan }) {
    if (!Array.isArray(plan) || !plan.length) return { error: "El plan vino vacío." };
    return calendario.agendar(plan);
  },

  async ver_calendario({ cuantas = 10 } = {}) {
    const proximas = await calendario.proximas(cuantas);
    return { total: proximas.length, proximas };
  },

  async guardar_nota({ titulo, texto }) {
    const archivo = await saber.guardarNota(titulo, texto, "chat");
    return { guardada: true, archivo: path.basename(archivo) };
  },

  async estado_sitio() {
    const { ficha, valores } = await leerDatos();
    const faltan = pendientes(ficha, valores);
    return {
      total: ficha.campos?.length ?? 0,
      completos: (ficha.campos?.length ?? 0) - faltan.length,
      faltan: faltan.map((c) => ({ clave: c.clave, seccion: c.seccion, pregunta: c.pregunta, ayuda: c.ayuda })),
    };
  },

  async cargar_dato({ clave, valor }) {
    const ficha = JSON.parse(await fs.readFile(RUTAS.datosJson, "utf8"));
    const campo = (ficha.campos || []).find((c) => c.clave === clave);
    if (!campo) {
      return { cargado: false, error: `No existe el dato «${clave}». Mirá estado_sitio para las claves válidas.` };
    }
    campo.valor = String(valor).trim();
    ficha.actualizado = new Date().toISOString().slice(0, 10);
    await fs.writeFile(RUTAS.datosJson, JSON.stringify(ficha, null, 2) + "\n", "utf8");

    const { valores } = await leerDatos();
    const faltan = pendientes(ficha, valores);
    return { cargado: true, clave, valor: campo.valor, faltanAhora: faltan.length };
  },

  async publicar_sitio({ simulacro = true, igualPublicar = false } = {}) {
    const { ficha, valores } = await leerDatos();
    const faltan = pendientes(ficha, valores);

    if (faltan.length && !igualPublicar) {
      return {
        publicado: false,
        motivo: `Faltan ${faltan.length} de ${ficha.campos.length} datos.`,
        faltan: faltan.map((c) => c.pregunta),
        nota: "Si la persona quiere publicar igual, volvé a llamar con igualPublicar en true.",
      };
    }

    const r = await actualizarSitio({ escribir: !simulacro });
    if (r.sinCambios) return { publicado: false, motivo: "La página ya estaba al día." };
    if (simulacro) {
      return { publicado: false, simulacro: true, nota: "No escribí nada. Para publicar de verdad, llamá con simulacro en false." };
    }

    const res = await empujar(`Actualizar el sitio (${new Date().toISOString().slice(0, 10)})`);
    return {
      publicado: !res.sinCambios,
      rama: res.rama,
      respaldo: r.respaldo ? path.basename(r.respaldo) : null,
      nota: "Cloudflare debería tomarlo en un minuto.",
    };
  },
};

/* ── Sólo para el panel ───────────────────────────────────────────
   Estas cuatro NO están en DEFINICIONES a propósito: el modelo no
   puede llamarlas. Aprobar una pieza y darla por publicada son
   decisiones de una persona, y con contenido que menciona cifras ese
   paso vale más que cualquier automatización.
   ────────────────────────────────────────────────────────────────── */

Object.assign(IMPLEMENTACIONES, {
  abrir_pieza:      ({ carpeta }) => piezas.abrir(carpeta),
  aprobar_pieza:    ({ carpeta }) => piezas.aprobar(carpeta),
  marcar_publicada: ({ carpeta }) => piezas.marcarPublicada(carpeta),
  descartar_pieza:  ({ carpeta }) => piezas.descartar(carpeta),
  ver_calendario_completo: () => calendario.leer(),
});

/** Ejecuta una herramienta por nombre, sin dejar que una excepción tumbe el chat. */
export async function ejecutar(nombre, entrada) {
  const fn = IMPLEMENTACIONES[nombre];
  if (!fn) return { error: `No existe la herramienta «${nombre}».` };
  try {
    return await fn(entrada || {});
  } catch (e) {
    return { error: e.message || String(e) };
  }
}
