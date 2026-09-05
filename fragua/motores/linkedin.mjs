/* ═══════════════════════════════════════════════════════════════════
   LINKEDIN · publicar una pieza aprobada.

   Para AgroTitan esta red probablemente rinda más que Instagram: el
   inversor está acá. Pero el permiso depende de dónde publiques, y la
   diferencia es enorme:

   · TU PERFIL. El producto «Share on LinkedIn» es autoservicio. Sin
     revisión, funciona el mismo día.

   · LA PÁGINA DE EMPRESA. Necesita la Community Management API: una
     revisión de LinkedIn que va de semanas a meses, y sólo se la dan a
     entidades legales registradas.

   El código es el mismo para las dos. Lo único que cambia es el URN
   del autor, y por eso el autor es un dato del .env y no algo escrito
   acá adentro: mientras LinkedIn revisa la página, apuntás
   LINKEDIN_AUTOR a tu perfil y el sistema anda; el día que aprueben,
   cambiás esa línea.

   Dos diferencias con Instagram que conviene saber:

   · Las imágenes se suben directo. LinkedIn acepta los bytes, así que
     no hace falta la vitrina ni ninguna URL pública.

   · El carrusel es un PDF. LinkedIn sacó el carrusel de imágenes
     deslizable de las publicaciones orgánicas; hoy lo que se desliza
     es el documento. De eso se ocupa nucleo/pdf.mjs.

   El token vivo NO va al .env ni al repositorio: vive en
   fragua/.linkedin.json, que está en el .gitignore.
   ═══════════════════════════════════════════════════════════════════ */

import fs from "node:fs/promises";
import path from "node:path";

import { RAÍZ } from "../nucleo/marca.mjs";

/** Las dos se pueden apuntar a otro lado para las pruebas. */
const API   = () => process.env.LINKEDIN_API   || "https://api.linkedin.com";
const LOGIN = () => process.env.LINKEDIN_LOGIN || "https://www.linkedin.com";

/** Dónde vive el token vivo. Nunca al repositorio. */
const ESTADO = () => process.env.LINKEDIN_ARCHIVO || path.join(RAÍZ, ".linkedin.json");

/* LinkedIn versiona su API por mes y exige la cabecera en cada
   llamada. Se fija acá y se sube a propósito, no sola: una versión
   nueva puede cambiar el formato de una respuesta. */
const VERSION = () => process.env.LINKEDIN_VERSION || "202601";

const DIA = 24 * 60 * 60 * 1000;

/* La vuelta del consentimiento cae en el mismo servidor local que ya
   corre el panel. LinkedIn acepta localhost como dirección de retorno. */
export const RETORNO = () =>
  process.env.LINKEDIN_RETORNO ||
  `http://localhost:${process.env.FRAGUA_PUERTO || 4321}/linkedin/callback`;

const COMO_CONFIGURAR =
  "LinkedIn no está configurado.\n\n" +
  "Hace falta, una sola vez:\n" +
  "  1. Crear una app en developers.linkedin.com, asociada a la página\n" +
  "     de empresa de AgroTitan.\n" +
  "  2. Agregarle los productos «Sign In with LinkedIn using OpenID\n" +
  "     Connect» y «Share on LinkedIn». Los dos son autoservicio.\n" +
  "  3. Para publicar en la PÁGINA hace falta además la Community\n" +
  "     Management API, que LinkedIn revisa y tarda semanas. Mientras\n" +
  "     tanto podés apuntar LINKEDIN_AUTOR a tu perfil personal.\n" +
  "  4. En la app, agregar esta dirección de retorno:\n" +
  `       ${RETORNO()}\n` +
  "  5. Poner LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET y\n" +
  "     LINKEDIN_AUTOR en el .env, y apretar «Conectar» en Estado.";

/* ── El token vivo ─────────────────────────────────────────────── */

async function leerEstado() {
  try { return JSON.parse(await fs.readFile(ESTADO(), "utf8")); }
  catch { return null; }
}

async function guardarEstado(datos) {
  await fs.writeFile(ESTADO(), JSON.stringify(datos, null, 2) + "\n", "utf8");
  return datos;
}

/** Lo mínimo para poder hablar con LinkedIn. */
export function configurado() {
  return Boolean(
    process.env.LINKEDIN_CLIENT_ID &&
    process.env.LINKEDIN_CLIENT_SECRET &&
    process.env.LINKEDIN_AUTOR
  );
}

/** "página de empresa" o "perfil personal", para decirlo en castellano. */
export function tipoDeAutor(urn = process.env.LINKEDIN_AUTOR || "") {
  if (urn.startsWith("urn:li:organization")) return "página de empresa";
  if (urn.startsWith("urn:li:person"))       return "perfil personal";
  return "autor desconocido";
}

/* ── Estado, para la pantalla del panel ────────────────────────── */

export async function estado() {
  if (!configurado()) return { activo: false, motivo: COMO_CONFIGURAR };

  const autor = process.env.LINKEDIN_AUTOR;

  if (!/^urn:li:(organization|person):.+/.test(autor)) {
    return {
      activo: false,
      motivo:
        `LINKEDIN_AUTOR tiene que ser un URN completo y dice «${autor}».\n\n` +
        `Para la página:  urn:li:organization:1234567\n` +
        `Para tu perfil:  urn:li:person:AbC123`,
    };
  }

  const guardado = await leerEstado();
  if (!guardado?.token) {
    return {
      activo: false,
      autor,
      tipo: tipoDeAutor(autor),
      necesitaConectar: true,
      motivo:
        "Falta autorizar a FRAGUA en LinkedIn. Es una vez: apretá «Conectar»,\n" +
        "aceptás en la pantalla de LinkedIn y volvés solo.",
    };
  }

  const diasRestantes = Math.trunc((new Date(guardado.hasta).getTime() - Date.now()) / DIA);

  if (diasRestantes < 0) {
    return {
      activo: false,
      autor,
      tipo: tipoDeAutor(autor),
      necesitaConectar: true,
      motivo:
        `El acceso a LinkedIn venció hace ${-diasRestantes} días. ` +
        `Apretá «Conectar» y volvés a autorizar; es la misma pantalla de antes.`,
    };
  }

  return {
    activo: true,
    autor,
    tipo: tipoDeAutor(autor),
    usuario: guardado.usuario || null,
    diasRestantes,
    puedeRefrescar: Boolean(guardado.refresco),
    aviso: avisoDeVencimiento(diasRestantes, Boolean(guardado.refresco)),
  };
}

/**
 * El aviso de vencimiento depende de si LinkedIn nos dio token de
 * refresco, y no todas las apps lo reciben.
 */
function avisoDeVencimiento(dias, hayRefresco) {
  if (dias >= 10) return null;
  return hayRefresco
    ? `El acceso vence en ${dias} días. Abrí FRAGUA antes de eso y se renueva solo.`
    : `El acceso vence en ${dias} días y esta app no recibió token de refresco de ` +
      `LinkedIn, así que no se renueva sola: vas a tener que apretar «Conectar» de nuevo.`;
}

/* ── Autorización ──────────────────────────────────────────────── */

/* openid y profile son para saber a nombre de quién quedó autorizado;
   w_member_social es publicar en tu perfil, w_organization_social en la
   página. Pedir el de organización con la app sin aprobar hace que
   LinkedIn rechace la autorización entera, así que se pide sólo el que
   corresponde al autor configurado. */
function permisos() {
  const base = ["openid", "profile"];
  return tipoDeAutor() === "página de empresa"
    ? [...base, "w_organization_social"].join(" ")
    : [...base, "w_member_social"].join(" ");
}

/** La dirección a la que hay que mandar a la persona. */
export async function conectar() {
  if (!configurado()) throw new Error(COMO_CONFIGURAR);

  // El estado protege contra que otra página dispare la vuelta.
  const testigo = crypto.randomUUID();
  await guardarEstado({ ...(await leerEstado()), testigo });

  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: RETORNO(),
    state: testigo,
    scope: permisos(),
  });

  return { url: `${LOGIN()}/oauth/v2/authorization?${q}`, permisos: permisos() };
}

/** La vuelta del consentimiento: cambia el código por el token. */
export async function atender({ code, state }) {
  const guardado = await leerEstado();

  if (!guardado?.testigo || state !== guardado.testigo) {
    throw new Error("La vuelta de LinkedIn no coincide con el pedido. Probá de nuevo desde Estado.");
  }
  if (!code) throw new Error("LinkedIn no mandó el código de autorización.");

  const d = await pedirToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: RETORNO(),
  });

  return guardarEstado({
    autor: process.env.LINKEDIN_AUTOR,
    token: d.access_token,
    refresco: d.refresh_token || null,
    desde: new Date().toISOString(),
    hasta: new Date(Date.now() + (d.expires_in || 60 * 86400) * 1000).toISOString(),
    usuario: null,
    testigo: null,
  });
}

async function pedirToken(campos) {
  const cuerpo = new URLSearchParams({
    ...campos,
    client_id: process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET,
  });

  const r = await fetch(`${LOGIN()}/oauth/v2/accessToken`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: cuerpo,
    signal: AbortSignal.timeout(60_000),
  });

  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    throw new Error(
      `LinkedIn rechazó el token (${r.status}): ` +
      `${d.error_description || d.error || "sin detalle"}`
    );
  }
  return d;
}

/**
 * Renueva el acceso, si LinkedIn nos dio con qué.
 *
 * No todas las apps reciben token de refresco: es de las aprobadas
 * para la plataforma de marketing. Sin él esto no es un error, es un
 * «hay que reconectar a mano», y así lo dice.
 */
export async function refrescarToken() {
  const guardado = await leerEstado();
  if (!guardado?.token) return { refrescado: false, motivo: "Todavía no autorizaste a FRAGUA." };

  if (!guardado.refresco) {
    return { refrescado: false, motivo: "LinkedIn no dio token de refresco: hay que reconectar a mano." };
  }
  if (Date.now() - new Date(guardado.desde).getTime() < DIA) {
    return { refrescado: false, motivo: "El acceso es de recién." };
  }

  try {
    const d = await pedirToken({ grant_type: "refresh_token", refresh_token: guardado.refresco });
    const ahora = new Date();

    await guardarEstado({
      ...guardado,
      token: d.access_token,
      // LinkedIn puede devolver un refresco nuevo o esperar que sigas
      // usando el viejo, según el caso.
      refresco: d.refresh_token || guardado.refresco,
      desde: ahora.toISOString(),
      hasta: new Date(ahora.getTime() + (d.expires_in || 60 * 86400) * 1000).toISOString(),
    });

    return { refrescado: true, hasta: new Date(ahora.getTime() + (d.expires_in || 60 * 86400) * 1000).toISOString() };
  } catch (e) {
    return { refrescado: false, motivo: e.message };
  }
}

/* ── Llamadas a LinkedIn ───────────────────────────────────────── */

async function token() {
  const g = await leerEstado();
  if (!g?.token) throw new Error(COMO_CONFIGURAR);
  return g.token;
}

async function pedir(ruta, { metodo = "GET", cuerpo, cabeceras = {} } = {}) {
  const r = await fetch(`${API()}${ruta}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${await token()}`,
      "linkedin-version": VERSION(),
      "x-restli-protocol-version": "2.0.0",
      ...(cuerpo ? { "content-type": "application/json" } : {}),
      ...cabeceras,
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    signal: AbortSignal.timeout(90_000),
  });

  // Varias respuestas de LinkedIn no traen cuerpo: el id viene en una
  // cabecera. Por eso devolvemos las dos cosas.
  const texto = await r.text();
  let datos = {};
  try { datos = texto ? JSON.parse(texto) : {}; } catch { /* sin cuerpo JSON */ }

  if (!r.ok) {
    throw new Error(
      `LinkedIn (${r.status}): ${datos.message || datos.error_description || texto.slice(0, 200) || "sin detalle"}`
    );
  }
  return { datos, cabeceras: r.headers };
}

/* ── Subir un archivo ──────────────────────────────────────────── */

/**
 * El alta de un archivo son tres pasos: pedir permiso, mandar los
 * bytes a la dirección que devuelven, y usar el URN resultante.
 *
 * `tipo` es "images" o "documents"; el resto es idéntico.
 */
async function subir(tipo, archivo) {
  const autor = process.env.LINKEDIN_AUTOR;

  const { datos } = await pedir(`/rest/${tipo}?action=initializeUpload`, {
    metodo: "POST",
    cuerpo: { initializeUploadRequest: { owner: autor } },
  });

  const v = datos.value || {};
  const destino = v.uploadUrl;
  const urn = v.image || v.document;

  if (!destino || !urn) {
    throw new Error(`LinkedIn no devolvió dónde subir el archivo (${tipo}).`);
  }

  const bytes = await fs.readFile(archivo);
  const r = await fetch(destino, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${await token()}`,
      "content-type": "application/octet-stream",
    },
    body: bytes,
    signal: AbortSignal.timeout(180_000),
  });

  if (!r.ok) {
    throw new Error(`No pude subir ${path.basename(archivo)} a LinkedIn (${r.status}).`);
  }
  return urn;
}

export const subirImagen    = (archivo) => subir("images", archivo);
export const subirDocumento = (archivo) => subir("documents", archivo);

/* ── Publicar ──────────────────────────────────────────────────── */

/**
 * Publica una pieza.
 *
 * @param {object} pieza  { texto, titulo }
 * @param {object} medio  { imagenes: [rutas] } o { documento: ruta }
 */
export async function publicar({ texto, titulo = "" }, medio) {
  if (!configurado()) throw new Error(COMO_CONFIGURAR);
  if (!texto?.trim()) throw new Error("Una publicación sin texto no dice nada.");

  const autor = process.env.LINKEDIN_AUTOR;
  let contenido;

  if (medio.documento) {
    // El carrusel. LinkedIn lo muestra deslizable, con contador.
    const urn = await subirDocumento(medio.documento);
    contenido = { media: { id: urn, title: titulo || "Carrusel" } };
  } else if (medio.imagenes?.length === 1) {
    const urn = await subirImagen(medio.imagenes[0]);
    contenido = { media: { id: urn, ...(titulo ? { altText: titulo } : {}) } };
  } else if (medio.imagenes?.length > 1) {
    const urns = [];
    for (const a of medio.imagenes) urns.push(await subirImagen(a));
    contenido = { multiImage: { images: urns.map((id) => ({ id })) } };
  } else {
    throw new Error("No hay ninguna imagen ni documento para publicar.");
  }

  const { datos, cabeceras } = await pedir("/rest/posts", {
    metodo: "POST",
    cuerpo: {
      author: autor,
      commentary: texto.trim(),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: contenido,
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    },
  });

  // El id llega en una cabecera, no en el cuerpo.
  const id = cabeceras.get("x-restli-id") || datos.id;
  if (!id) throw new Error("LinkedIn aceptó la publicación pero no dijo con qué id.");

  return {
    id,
    permalink: `https://www.linkedin.com/feed/update/${id}/`,
    formato: medio.documento ? "documento" : `${medio.imagenes.length} imagen(es)`,
  };
}
