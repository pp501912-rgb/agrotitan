"use strict";

const WHATSAPP = "5491158735770";

const EMAIL = "augustoniente@gmail.com";

const MENSAJE_DIRECTO =
  "Hola, quiero consultar sobre evaluación de proyecto agropecuario.";

const MENSAJES_POR_BOTON = {
  enlaceWhatsappHero:
    "Hola, quiero evaluar un proyecto agropecuario.",
  enlaceWhatsappCampo:
    "Hola, tengo un campo en producción y quiero saber si puede rendir más.",
};

function enlaceWhatsapp(texto) {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}

function enlaceCorreo(asunto, cuerpo) {
  return `mailto:${EMAIL}?subject=${encodeURIComponent(asunto)}` +
         `&body=${encodeURIComponent(cuerpo)}`;
}

function prepararEnlacesDirectos() {
  const url = enlaceWhatsapp(MENSAJE_DIRECTO);

  ["whatsappFlotante", "enlaceWhatsapp"].forEach((id) => {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.href = url;
    boton.target = "_blank";
  });

  Object.entries(MENSAJES_POR_BOTON).forEach(([id, mensaje]) => {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.href = enlaceWhatsapp(mensaje);
    boton.target = "_blank";
  });

  const numero = document.getElementById("numeroWhatsapp");
  if (numero) {
    numero.href = url;
    numero.target = "_blank";

    numero.textContent = formatearNumero(WHATSAPP);
  }

  const enlaceEm = document.getElementById("enlaceEmail");
  if (enlaceEm) {
    enlaceEm.href = `mailto:${EMAIL}`;
    enlaceEm.textContent = EMAIL;
  }
}

function formatearNumero(crudo) {

  if (crudo.length < 12) return "+" + crudo;
  const resto = crudo.slice(3);
  if (resto.startsWith("11")) {
    return `+${crudo.slice(0, 2)} ${crudo.slice(2, 3)} 11 ` +
           `${resto.slice(2, 6)}-${resto.slice(6)}`;
  }
  return `+${crudo.slice(0, 2)} ${crudo.slice(2, 3)} ${crudo.slice(3, 6)} ` +
         `${crudo.slice(6, 9)}-${crudo.slice(9)}`;
}

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

function prepararFormulario() {
  const form = document.getElementById("formularioContacto");
  if (!form) return;

  let via = "whatsapp";
  form.querySelectorAll("button[data-via]").forEach((boton) => {
    boton.addEventListener("click", () => { via = boton.dataset.via; });
  });

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

document.addEventListener("DOMContentLoaded", () => {
  prepararEnlacesDirectos();
  prepararFormulario();

  const anio = document.getElementById("anio");
  if (anio) anio.textContent = new Date().getFullYear();

  if (WHATSAPP.includes("0000000000")) {
    console.warn(
      "AgroTitan · Falta reemplazar el número de WhatsApp y el correo " +
      "en js/contacto.js (constantes WHATSAPP y EMAIL)."
    );
  }
});
