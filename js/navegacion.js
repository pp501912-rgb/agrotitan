/* ═══════════════════════════════════════════════════════════════════
   AGROTITAN · NAVEGACIÓN
   Menú del teléfono, barra al desplazar y sección activa.
   Sin librerías.
   ═══════════════════════════════════════════════════════════════════ */

"use strict";

/* ── Menú del teléfono ──────────────────────────────────────────── */

function prepararMenu() {
  const boton = document.getElementById("menuBoton");
  const nav = document.getElementById("nav");
  if (!boton || !nav) return;

  const cerrar = () => {
    nav.classList.remove("abierto");
    boton.setAttribute("aria-expanded", "false");
    boton.setAttribute("aria-label", "Abrir menú");
  };

  boton.addEventListener("click", () => {
    const abierto = nav.classList.toggle("abierto");
    boton.setAttribute("aria-expanded", String(abierto));
    boton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
  });

  // Al tocar un enlace, el menú se cierra solo
  nav.querySelectorAll("a").forEach((enlace) => {
    enlace.addEventListener("click", cerrar);
  });

  // Escape cierra y devuelve el foco al botón
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && nav.classList.contains("abierto")) {
      cerrar();
      boton.focus();
    }
  });

  // Al pasar a pantalla ancha, el menú desplegable ya no aplica
  window.matchMedia("(min-width: 900px)").addEventListener("change", cerrar);
}

/* ── Barra al desplazar ─────────────────────────────────────────── */
/* La línea dorada aparece recién al bajar, para que el hero respire. */

function prepararBarra() {
  const barra = document.getElementById("barra");
  if (!barra) return;

  const actualizar = () => {
    barra.classList.toggle("desplazada", window.scrollY > 40);
  };

  actualizar();
  // passive: el navegador sabe que no vamos a bloquear el scroll
  window.addEventListener("scroll", actualizar, { passive: true });
}

/* ── Sección activa ─────────────────────────────────────────────── */
/* Marca en el menú la sección que se está viendo.
   IntersectionObserver en vez de calcular posiciones en cada scroll:
   el navegador lo resuelve sin trabar la página. */

function prepararSeccionActiva() {
  const enlaces = [...document.querySelectorAll('.nav a[href^="#"]')];
  if (!enlaces.length) return;

  const porId = new Map();
  enlaces.forEach((enlace) => {
    const id = enlace.getAttribute("href").slice(1);
    if (id) porId.set(id, enlace);
  });

  const secciones = [...porId.keys()]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (!secciones.length) return;

  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        const enlace = porId.get(entrada.target.id);
        if (!enlace) return;
        if (entrada.isIntersecting) {
          enlaces.forEach((e) => e.classList.remove("activo"));
          enlace.classList.add("activo");
        }
      });
    },
    // Se considera activa cuando la sección cruza la franja central
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );

  secciones.forEach((seccion) => observador.observe(seccion));
}

/* ── Arranque ───────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  prepararMenu();
  prepararBarra();
  prepararSeccionActiva();
});
