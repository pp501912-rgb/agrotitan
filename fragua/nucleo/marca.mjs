/* ═══════════════════════════════════════════════════════════════════
   MARCA · las constantes de AgroTitan y las rutas del proyecto.

   Todo lo que sea "un valor de la marca" vive acá y en ningún otro
   lado. Si mañana cambia el oro, se cambia en una línea.

   Los colores están duplicados a propósito en public/css/base.css:
   ese archivo lo lee el navegador del visitante, éste lo lee la app.
   Si tocás uno, tocá el otro.
   ═══════════════════════════════════════════════════════════════════ */

import { fileURLToPath } from "node:url";
import path from "node:path";

const aquí = path.dirname(fileURLToPath(import.meta.url));

/** Raíz de fragua/ y raíz del repositorio. */
export const RAÍZ = path.resolve(aquí, "..");
export const REPO = path.resolve(RAÍZ, "..");

export const RUTAS = {
  conocimiento: path.join(RAÍZ, "conocimiento"),
  notas:        path.join(RAÍZ, "conocimiento", "notas"),
  promptMaestro:path.join(RAÍZ, "conocimiento", "PROMPT-MAESTRO.txt"),
  temas:        path.join(RAÍZ, "conocimiento", "temas.json"),
  hashtags:     path.join(RAÍZ, "conocimiento", "hashtags.json"),
  historial:    path.join(RAÍZ, "conocimiento", "historial.json"),
  glosario:     path.join(RAÍZ, "conocimiento", "glosario.md"),

  contenido:    path.join(RAÍZ, "contenido"),
  sitioJson:    path.join(RAÍZ, "contenido", "sitio.json"),
  datosJson:    path.join(RAÍZ, "contenido", "datos.json"),

  plantillas:   path.join(RAÍZ, "plantillas"),
  paginaHtml:   path.join(RAÍZ, "plantillas", "pagina.html"),

  piezas:       path.join(RAÍZ, "piezas"),
  panel:        path.join(RAÍZ, "panel"),
  salida:       path.join(RAÍZ, "salida"),

  // Del repositorio, fuera de fragua/
  publico:      path.join(REPO, "public"),
  publicoIndex: path.join(REPO, "public", "index.html"),
  fuentes:      path.join(REPO, "public", "fuentes"),
  maqueta:      path.join(REPO, "propuesta", "index.html"),
};

/* ── Paleta ────────────────────────────────────────────────────────
   Las cinco de la marca más los derivados permitidos. No se agregan
   colores: ni azules ni violetas, que aparecieron por error en una
   versión previa del sitio.
   ────────────────────────────────────────────────────────────────── */
export const PALETA = {
  obsidiana:  "#0A0A0A",   // fondo principal
  acero:      "#2B2B2B",   // tarjetas y separaciones
  oro:        "#E5C158",   // acentos, títulos, cifras destacadas
  verde:      "#1B4332",   // llamada a la acción, indicadores positivos
  hueso:      "#F5F3EE",   // texto (el blanco puro es muy duro sobre obsidiana)

  oroClaro:   "#F0D687",
  verdeClaro: "#2D6A4F",
  aceroClaro: "#3A3A3A",
};

/* ── Tipografías ──────────────────────────────────────────────────
   Servidas desde public/fuentes/, nunca desde Google Fonts: con
   señal débil en el campo cada petición externa cuesta segundos, y
   además un tercero vería la IP del visitante.
   ────────────────────────────────────────────────────────────────── */
export const FUENTES = [
  // Títulos y cifras destacadas: condensada, industrial.
  { familia: "Rajdhani",      archivo: "rajdhani-600.woff2",        peso: 600, estilo: "normal" },
  { familia: "Rajdhani",      archivo: "rajdhani-700.woff2",        peso: 700, estilo: "normal" },

  // Cuerpo. Reemplazó a EB Garamond cuando se unificaron el sitio y las
  // placas: la maqueta nueva ya usaba Plex y las placas seguían en serif,
  // así que eran dos marcas conviviendo.
  { familia: "IBM Plex Sans", archivo: "ibmplexsans-400.woff2",       peso: 400, estilo: "normal" },
  { familia: "IBM Plex Sans", archivo: "ibmplexsans-400italic.woff2", peso: 400, estilo: "italic" },
  { familia: "IBM Plex Sans", archivo: "ibmplexsans-500.woff2",       peso: 500, estilo: "normal" },
  { familia: "IBM Plex Sans", archivo: "ibmplexsans-600.woff2",       peso: 600, estilo: "normal" },

  // Cifras y unidades, que van en columnas y necesitan ancho fijo.
  { familia: "IBM Plex Mono", archivo: "ibmplexmono-500.woff2",       peso: 500, estilo: "normal" },
  { familia: "IBM Plex Mono", archivo: "ibmplexmono-600.woff2",       peso: 600, estilo: "normal" },
];

/** Formato de las piezas de Instagram: vertical, que ocupa más pantalla. */
export const PIEZA = { ancho: 1080, alto: 1350 };

/** Las cuatro plantillas disponibles. */
export const PLANTILLAS = ["cita", "dato", "carrusel", "servicio"];

/** Las dos audiencias. Una pieza elige una; nunca se promedian. */
export const AUDIENCIAS = ["inversor", "productor"];

/** Contacto. El correo todavía falta: no usar el Gmail personal. */
export const CONTACTO = {
  whatsapp: "5491158735770",
  enlaceWa: "https://wa.me/5491158735770",
  correo:   null,                       // ← [correo con dominio propio]
  sitio:    "https://agrotitan.inversionesdelagro.workers.dev",
};
