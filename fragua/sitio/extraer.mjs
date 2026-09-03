/* ═══════════════════════════════════════════════════════════════════
   EXTRAER · separa el contenido editable del marcado de la página.

   Lee propuesta/index.html y escribe:

     plantillas/pagina.html   la misma página con {{marcadores}}
     contenido/datos.json     los 37 datos pendientes, como formulario

   Se corre una sola vez, o cada vez que la maqueta cambie a mano. No
   toca public/ ni propuesta/: sólo genera. Quien publica es
   construir.mjs, y antes de escribir nada compara con el original.

   Uso:  node sitio/extraer.mjs
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import { RUTAS } from "../nucleo/marca.mjs";
import { MAPA, conIds, clavesÚnicas } from "./mapa-datos.mjs";

const SPAN = /<span class="falta">([^<]*)<\/span>/g;

/** Reemplaza cada marcador por {{dato.clave}}, validando uno por uno. */
export function marcarPlantilla(html) {
  const encontrados = [...html.matchAll(SPAN)];

  if (encontrados.length !== MAPA.length) {
    throw new Error(
      `La maqueta tiene ${encontrados.length} marcadores y el mapa describe ` +
      `${MAPA.length}. Alguien editó propuesta/index.html: hay que actualizar ` +
      `sitio/mapa-datos.mjs antes de seguir.`
    );
  }

  // Verificamos que cada uno sea el que el mapa dice, en orden. Sin esto,
  // agregar un marcador al medio correría todos los demás y cargaríamos
  // el precio de una etapa en el plazo de otra, sin que nadie lo note.
  encontrados.forEach((m, i) => {
    if (m[1] !== MAPA[i].espera) {
      throw new Error(
        `El marcador nº ${i + 1} dice «${m[1]}» y el mapa esperaba ` +
        `«${MAPA[i].espera}» (clave: ${MAPA[i].clave}).\n` +
        `Actualizá sitio/mapa-datos.mjs para que coincidan.`
      );
    }
  });

  const mapa = conIds();
  let i = 0;
  return html.replace(SPAN, () => `{{{dato.${mapa[i++].id}}}}`);
}

/** Arma contenido/datos.json vacío, listo para completar. */
export function fichaDeDatos() {
  const campos = clavesÚnicas().map((e) => ({
    clave:    e.clave,
    seccion:  e.seccion,
    pregunta: e.pregunta,
    ayuda:    e.ayuda || "",
    valor:    "",
  }));

  return {
    _leeme:
      "Los datos que la página necesita y todavía no tenemos. Mientras 'valor' " +
      "esté vacío, la página los muestra entre corchetes y el constructor se " +
      "niega a publicar. Completalos desde el panel o acá a mano.",
    actualizado: new Date().toISOString().slice(0, 10),
    campos,
  };
}

/* ── Uso desde la terminal ─────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const maqueta = await fs.readFile(RUTAS.maqueta, "utf8");
  const plantilla = marcarPlantilla(maqueta);

  await fs.mkdir(RUTAS.plantillas, { recursive: true });
  await fs.mkdir(RUTAS.contenido, { recursive: true });
  await fs.writeFile(RUTAS.paginaHtml, plantilla, "utf8");

  // Nunca pisamos datos ya cargados: si el archivo existe, se respeta.
  let yaHabia = false;
  try { await fs.access(RUTAS.datosJson); yaHabia = true; } catch { /* no existe */ }

  if (yaHabia) {
    console.log("contenido/datos.json ya existe: no lo toco.");
  } else {
    const ficha = fichaDeDatos();
    await fs.writeFile(RUTAS.datosJson, JSON.stringify(ficha, null, 2) + "\n", "utf8");
    console.log(`contenido/datos.json creado con ${ficha.campos.length} campos.`);
  }

  console.log(`plantillas/pagina.html escrito (${MAPA.length} marcadores reemplazados).`);
}
