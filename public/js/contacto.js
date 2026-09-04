/* ═══════════════════════════════════════════════════════════════════
   AGROTITAN · CONTACTO

   Este formulario NO envía nada a ningún servidor.

   Toma lo que escribió el visitante, arma un mensaje redactado y lo
   abre en WhatsApp o en su cliente de correo. El mensaje viaja DIRECTO
   del cliente a AgroTitan: ningún servicio intermediario lo lee, no
   hay nada que configurar, no hay nada que pagar, y no puede dejar de
   funcionar porque un tercero cierre.

   ⚠ REEMPLAZAR · las dos constantes de acá abajo son lo único que hay
     que completar antes de publicar.
   ═══════════════════════════════════════════════════════════════════ */

"use strict";

/* ── ⚠ REEMPLAZAR: datos reales de contacto ─────────────────────── */

// Formato internacional, solo números, sin +, sin espacios, sin guiones.
// Argentina: 54 + 9 + código de área SIN el 0 + número SIN el 15
// Ejemplo: (0351) 15-123-4567  →  "5493511234567"
const WHATSAPP = "5491158735770";

// Provisorio: el propietario avisó que lo va a cambiar más adelante
// por uno propio de AgroTitan (contacto@agrotitan.com o similar).
const EMAIL = "augustoniente@gmail.com";

// Mensaje del botón flotante, para quien no quiere llenar el formulario
const MENSAJE_DIRECTO =
  "Hola, quiero consultar sobre evaluación de proyecto agropecuario.";

/* Cada botón de WhatsApp abre con un mensaje distinto según desde dónde
   se toca. El del carril de productores no pregunta lo mismo que el de
   la portada, y esa diferencia le ahorra un ida y vuelta al visitante. */
const MENSAJES_POR_BOTON = {
  enlaceWhatsappHero:
    "Hola, quiero evaluar un proyecto agropecuario.",
  enlaceWhatsappCampo:
    "Hola, tengo un campo en producción y quiero saber si puede rendir más.",
};

/* ── Enlaces directos ───────────────────────────────────────────── */

function enlaceWhatsapp(texto) {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}

function enlaceCorreo(asunto, cuerpo) {
  return `mailto:${EMAIL}?subject=${encodeURIComponent(asunto)}` +
         `&body=${encodeURIComponent(cuerpo)}`;
}

/* Botones de WhatsApp y enlaces del bloque de contacto.
   El número y el correo viven en un solo lugar (arriba de este archivo):
   acá solamente se reparten. */
function prepararEnlacesDirectos() {
  const url = enlaceWhatsapp(MENSAJE_DIRECTO);

  // Botones que ya traen su ícono y su texto en el HTML: solo el destino.
  ["whatsappFlotante", "enlaceWhatsapp"].forEach((id) => {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.href = url;
    boton.target = "_blank";
  });

  // Botones con mensaje propio según la sección
  Object.entries(MENSAJES_POR_BOTON).forEach(([id, mensaje]) => {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.href = enlaceWhatsapp(mensaje);
    boton.target = "_blank";
  });

  // Acá sí se escribe el número, porque es un dato a la vista
  const numero = document.getElementById("numeroWhatsapp");
  if (numero) {
    numero.href = url;
    numero.target = "_blank";
    // Se muestra con formato legible, pero el enlace usa el crudo
    numero.textContent = formatearNumero(WHATSAPP);
  }

  const enlaceEm = document.getElementById("enlaceEmail");
  if (enlaceEm) {
    enlaceEm.href = `mailto:${EMAIL}`;
    enlaceEm.textContent = EMAIL;
  }
}

function formatearNumero(crudo) {
  // 5493511234567 → +54 9 351 123-4567   (código de área de 3 dígitos)
  // 5491158735770 → +54 9 11 5873-5770   (Buenos Aires/CABA: 2 dígitos)
  //
  // ⚠ No es una tabla completa de códigos de área argentinos — hay
  //   varios largos (2, 3 y 4 dígitos) y esto no los distingue todos.
  //   Cubre el caso general (3 dígitos) y el más común de excepción
  //   (Buenos Aires, "11"). Si el número de otra ciudad se ve mal acá,
  //   agregar su prefijo a este mismo if.
  if (crudo.length < 12) return "+" + crudo;
  const resto = crudo.slice(3);
  if (resto.startsWith("11")) {
    return `+${crudo.slice(0, 2)} ${crudo.slice(2, 3)} 11 ` +
           `${resto.slice(2, 6)}-${resto.slice(6)}`;
  }
  return `+${crudo.slice(0, 2)} ${crudo.slice(2, 3)} ${crudo.slice(3, 6)} ` +
         `${crudo.slice(6, 9)}-${crudo.slice(9)}`;
}

/* ── Validación ─────────────────────────────────────────────────── */

const MENSAJES = {
  nombre:  "Decinos cómo te llamás.",
  pais:    "Elegí tu país.",
  perfil:  "Contanos si sos productor, inversor u otro.",
  mensaje: "Contanos algo del proyecto, aunque sea breve.",
};

function mostrarError(campo, texto) {
  const contenedor = campo.closest(".campo");
  const aviso = contenedor.querySelector(".campo__error");
  contenedor.classList.add("con-error");
  if (aviso) {
    aviso.textContent = texto;
    aviso.classList.add("visible");
  }
}

function limpiarError(campo) {
  const contenedor = campo.closest(".campo");
  const aviso = contenedor.querySelector(".campo__error");
  contenedor.classList.remove("con-error");
  if (aviso) aviso.classList.remove("visible");
}

function validar(form) {
  let primerFallo = null;

  for (const nombre of ["nombre", "pais", "perfil", "mensaje"]) {
    const campo = form.elements[nombre];
    if (!campo) continue;

    limpiarError(campo);

    if (!campo.value.trim()) {
      mostrarError(campo, MENSAJES[nombre]);
      if (!primerFallo) primerFallo = campo;
    }
  }

  // Un mensaje de tres palabras no le sirve a nadie: ni a quien escribe,
  // ni a quien responde.
  const mensaje = form.elements.mensaje;
  if (mensaje && mensaje.value.trim() && mensaje.value.trim().length < 15) {
    mostrarError(mensaje, "Un poco más de detalle nos ayuda a responderte mejor.");
    if (!primerFallo) primerFallo = mensaje;
  }

  if (primerFallo) {
    primerFallo.focus();
    primerFallo.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }
  return true;
}

/* ── Armado del mensaje ─────────────────────────────────────────── */

function armarMensaje(form) {
  const d = {
    nombre:  form.elements.nombre.value.trim(),
    pais:    form.elements.pais.value,
    perfil:  form.elements.perfil.value,
    rubro:   form.elements.rubro.value,
    mensaje: form.elements.mensaje.value.trim(),
  };

  const lineas = [
    "Consulta desde agrotitan",
    "",
    `Nombre: ${d.nombre}`,
    `País: ${d.pais}`,
    `Perfil: ${d.perfil}`,
  ];

  if (d.rubro) lineas.push(`Rubro: ${d.rubro}`);

  lineas.push("", "Proyecto:", d.mensaje);

  return {
    texto: lineas.join("\n"),
    asunto: `Consulta de ${d.nombre} · ${d.perfil} · ${d.pais}`,
  };
}

/* ── Envío ──────────────────────────────────────────────────────── */

function prepararFormulario() {
  const form = document.getElementById("formularioContacto");
  if (!form) return;

  // Qué botón se apretó: WhatsApp o correo
  let via = "whatsapp";
  form.querySelectorAll("button[data-via]").forEach((boton) => {
    boton.addEventListener("click", () => { via = boton.dataset.via; });
  });

  // Al corregir un campo, el error desaparece enseguida
  form.querySelectorAll("input, select, textarea").forEach((campo) => {
    campo.addEventListener("input", () => limpiarError(campo));
    campo.addEventListener("change", () => limpiarError(campo));
  });

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();

    if (!validar(form)) return;

    const { texto, asunto } = armarMensaje(form);

    const destino = via === "email"
      ? enlaceCorreo(asunto, texto)
      : enlaceWhatsapp(texto);

    // WhatsApp abre en pestaña nueva; el correo abre la app del sistema
    // y no conviene abrirle una pestaña vacía al visitante.
    if (via === "email") {
      window.location.href = destino;
    } else {
      window.open(destino, "_blank", "noopener");
    }

    confirmar(form, via);
  });
}

function confirmar(form, via) {
  const acciones = form.querySelector(".formulario__acciones");
  if (!acciones || acciones.querySelector(".aviso-enviado")) return;

  const aviso = document.createElement("p");
  aviso.className = "aviso-enviado";
  aviso.setAttribute("role", "status");
  aviso.style.cssText =
    "flex-basis:100%;color:var(--oro);font-family:var(--tipo-ui);" +
    "font-size:.95rem;line-height:1.5";
  aviso.textContent = via === "email"
    ? "Se abrió tu correo con el mensaje listo. Revisá que se haya cargado y enviálo."
    : "Se abrió WhatsApp con el mensaje listo. Solo falta que lo envíes.";

  acciones.appendChild(aviso);
}

/* ── Arranque ───────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  prepararEnlacesDirectos();
  prepararFormulario();

  const anio = document.getElementById("anio");
  if (anio) anio.textContent = new Date().getFullYear();

  // Aviso en consola si quedaron los datos de ejemplo sin reemplazar
  if (WHATSAPP.includes("0000000000")) {
    console.warn(
      "AgroTitan · Falta reemplazar el número de WhatsApp y el correo " +
      "en js/contacto.js (constantes WHATSAPP y EMAIL)."
    );
  }
});
