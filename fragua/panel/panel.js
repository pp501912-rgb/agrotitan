/* ═══════════════════════════════════════════════════════════════════
   PANEL · la lógica de la interfaz.

   Sin framework y sin paso de compilación: es un módulo que el
   navegador carga tal cual. Para una herramienta de escritorio de una
   sola persona, cualquier otra cosa es exceso de equipaje.
   ═══════════════════════════════════════════════════════════════════ */

const $  = (s, d = document) => d.querySelector(s);
const $$ = (s, d = document) => [...d.querySelectorAll(s)];

async function api(ruta, cuerpo) {
  const r = await fetch(ruta, cuerpo
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }
    : undefined);
  return r.json();
}

const herramienta = (nombre, entrada = {}) => api("/api/herramienta", { nombre, entrada });

/* ── Pestañas ──────────────────────────────────────────────────── */

function irA(destino) {
  // La dirección puede traer una pieza puntual: #piezas/2026-09-03-nogal
  const [vista, ...resto] = String(destino).split("/");
  const carpeta = resto.join("/");

  const boton = $(`.pestana[data-vista="${vista}"]`);
  if (!boton) return;

  $$(".pestana").forEach((x) => x.classList.remove("pestana--activa"));
  $$(".vista").forEach((x) => x.classList.remove("vista--activa"));
  boton.classList.add("pestana--activa");
  $(`#vista-${vista}`).classList.add("vista--activa");
  if (location.hash.slice(1) !== destino) location.hash = destino;

  if (vista === "datos")  cargarDatos();
  if (vista === "piezas") carpeta ? abrirPieza(decodeURIComponent(carpeta)) : cargarPiezas();
  if (vista === "temas")  cargarTemas();
  if (vista === "plan")   cargarPlan();
  if (vista === "notas")  cargarNotas();
  if (vista === "estado") cargarEstado();
}

$$(".pestana").forEach((b) => b.addEventListener("click", () => irA(b.dataset.vista)));

// La dirección lleva la pestaña, así se puede guardar el marcador de
// "datos de la página" y entrar directo ahí.
window.addEventListener("hashchange", () => irA(location.hash.slice(1)));

/* ═══ CONVERSAR ══════════════════════════════════════════════════ */

let conversacion = null;
let ocupado = false;

const chat = $("#chat");

function turnoNuevo(quien, clase = "") {
  $(".bienvenida")?.remove();
  const el = document.createElement("div");
  el.className = `turno turno--${quien === "Vos" ? "vos" : "heraldo"} ${clase}`;
  el.innerHTML = `<div class="turno__quien"></div><div class="turno__texto"></div>`;
  $(".turno__quien", el).textContent = quien;
  chat.append(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

/** Traduce el resultado de una herramienta a una línea legible. */
function resumirPaso(paso) {
  const s = paso.salida || {};
  if (s.error) return `<b>${paso.herramienta}</b> — ${s.error}`;

  switch (paso.herramienta) {
    case "buscar_conocimiento": return `<b>buscó</b> «${paso.entrada.consulta}» — ${s.encontrado ?? 0} resultados`;
    case "listar_temas":        return `<b>miró el banco</b> — ${s.total} temas`;
    case "revisar_repeticion":  return s.repetido ? `<b>ojo</b> — ya publicamos algo parecido` : `<b>revisó repeticiones</b> — nada parecido`;
    case "proponer_hashtags":   return `<b>armó hashtags</b> — ${s.cuantos}`;
    case "variantes_locales":   return s.disponible ? `<b>pidió a Ollama</b> — ${s.cuantas} variantes` : `<b>Ollama</b> — ${s.motivo}`;
    case "guardar_pieza":       return s.guardada
                                  ? `<b>guardó la pieza</b> — salida/${s.carpeta} (${s.imagenes.length} imágenes)`
                                  : `<b>la pieza no pasó el contrato</b> — ${s.problemas.length} problemas`;
    case "guardar_nota":        return `<b>guardó una nota</b> — ${s.archivo}`;
    case "estado_sitio":        return `<b>revisó la página</b> — faltan ${s.faltan?.length ?? 0} de ${s.total}`;
    case "cargar_dato":         return s.cargado ? `<b>cargó</b> ${s.clave} = ${s.valor}` : `<b>no pudo cargar</b> — ${s.error}`;
    case "publicar_sitio":      return s.publicado ? `<b>publicó</b> en ${s.rama}` : `<b>no publicó</b> — ${s.motivo || s.nota}`;
    case "escribir_en_cascada":  return s.cascada
                                  ? `<b>cascada</b> — ${s.borradoresLocales} borradores de Ollama, gratis, y Claude eligió en una llamada`
                                  : `<b>escribió sin cascada</b> — ${s.nota}`;
    case "listar_piezas":        return `<b>miró las piezas</b> — ${s.total}`;
    case "planificar_mes":       return `<b>armó un plan</b> — ${s.propuestas} para ${s.diasDisponibles} días${s.alcanza ? "" : ", no alcanzan los temas"}`;
    case "agendar_plan":         return `<b>agendó</b> ${s.agendadas} publicaciones`;
    case "ver_calendario":       return `<b>miró el calendario</b> — ${s.total} por delante`;
    case "listar_audios":        return `<b>miró los audios</b> — ${s.total}, ${s.pendientes} sin transcribir`;
    case "transcribir_audio":    return s.transcrito
                                  ? `<b>transcribió</b> ${s.nota || (s.hechos || []).length + " audio(s)"}`
                                  : `<b>no transcribió</b> — ${s.motivo || "nada pendiente"}`;
    default:                    return `<b>${paso.herramienta}</b>`;
  }
}

async function enviar(texto) {
  if (ocupado || !texto.trim()) return;
  ocupado = true;
  $("#enviar").disabled = true;

  $(".turno__texto", turnoNuevo("Vos")).textContent = texto;

  const el = turnoNuevo("Heraldo");
  const cuerpo = $(".turno__texto", el);
  cuerpo.innerHTML = `<span class="pensando">pensando…</span>`;

  try {
    const r = await api("/api/chat", { mensaje: texto, conversacion });

    if (r.error) {
      el.classList.add("error");
      cuerpo.textContent = r.error + (r.sugerencia ? `\n\n${r.sugerencia}` : "");
    } else {
      conversacion = r.conversacion;
      cuerpo.textContent = r.respuesta || "(sin respuesta)";

      if (r.pasos?.length) {
        const pasos = document.createElement("div");
        pasos.className = "pasos";
        pasos.innerHTML = r.pasos
          .map((p) => `<div class="paso${p.salida?.error ? " paso--error" : ""}">${resumirPaso(p)}</div>`)
          .join("");
        el.append(pasos);
      }
    }
  } catch (e) {
    el.classList.add("error");
    cuerpo.textContent = `No pude hablar con el servidor: ${e.message}`;
  } finally {
    ocupado = false;
    $("#enviar").disabled = false;
    chat.scrollTop = chat.scrollHeight;
  }
}

$("#redactor").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("#mensaje").value;
  $("#mensaje").value = "";
  $("#mensaje").style.height = "auto";
  enviar(t);
});

// Enter manda; Shift+Enter hace un renglón nuevo.
$("#mensaje").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#redactor").requestSubmit(); }
});

$("#mensaje").addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px";
});

chat.addEventListener("click", (e) => {
  if (e.target.classList.contains("sug")) enviar(e.target.textContent.trim());
});

/* ═══ DATOS DE LA PÁGINA ═════════════════════════════════════════ */

async function cargarDatos() {
  const s = await herramienta("estado_sitio");
  const lista = $("#datos-lista");

  $("#datos-resumen").textContent =
    s.faltan.length === 0
      ? `Los ${s.total} datos están completos. La página se puede publicar.`
      : `${s.completos} de ${s.total} completos. Faltan ${s.faltan.length}.`;

  // Agrupamos por sección para que el formulario no sea una lista larga.
  const porSeccion = new Map();
  for (const c of s.faltan) {
    if (!porSeccion.has(c.seccion)) porSeccion.set(c.seccion, []);
    porSeccion.get(c.seccion).push(c);
  }

  lista.innerHTML = porSeccion.size === 0
    ? `<p class="sub">No queda nada por completar.</p>`
    : [...porSeccion].map(([seccion, campos]) => `
        <div class="grupo">
          <h2 class="grupo__t">${seccion}</h2>
          ${campos.map((c) => `
            <div class="campo">
              <div>
                <div class="campo__pregunta">${escapar(c.pregunta)}</div>
                ${c.ayuda ? `<div class="campo__ayuda">${escapar(c.ayuda)}</div>` : ""}
                <div class="campo__clave">${c.clave}</div>
              </div>
              <input data-clave="${c.clave}" placeholder="Sin completar">
            </div>`).join("")}
        </div>`).join("");

  // Se guarda al salir del campo: sin botón de guardar, sin perder nada.
  $$("#datos-lista input").forEach((input) => {
    input.addEventListener("change", async () => {
      const valor = input.value.trim();
      if (!valor) return;
      const r = await herramienta("cargar_dato", { clave: input.dataset.clave, valor });
      if (r.cargado) {
        input.classList.add("cargado");
        $("#datos-resumen").textContent = `Faltan ${r.faltanAhora} de ${s.total}.`;
      } else {
        avisar(r.error);
      }
    });
  });
}

function avisar(texto) {
  const el = $("#datos-aviso");
  el.textContent = texto;
  el.hidden = !texto;
}

$("#btn-verificar").addEventListener("click", async () => {
  avisar("Verificando…");
  const r = await api("/api/verificar-sitio");
  avisar(r.igual
    ? "✓ La página reconstruida es idéntica a la maqueta. La extracción no perdió nada."
    : `✗ Difieren en ${r.difs.length} lugares. Primera: línea ${r.difs[0]?.linea}.`);
});

$("#btn-simulacro").addEventListener("click", async () => {
  avisar("Probando en seco…");
  const r = await herramienta("publicar_sitio", { simulacro: true, igualPublicar: true });
  avisar(r.nota || r.motivo || JSON.stringify(r));
});

$("#btn-publicar").addEventListener("click", async () => {
  const s = await herramienta("estado_sitio");
  const conFaltantes = s.faltan.length > 0;

  const pregunta = conFaltantes
    ? `Faltan ${s.faltan.length} datos: van a salir entre corchetes en la página publicada.\n\n¿Publico igual?`
    : `Se va a reconstruir la página, commitear y empujar a GitHub.\n\n¿Publico?`;

  if (!confirm(pregunta)) return;

  avisar("Publicando…");
  const r = await herramienta("publicar_sitio", { simulacro: false, igualPublicar: true });
  avisar(r.publicado
    ? `✓ Publicado en la rama ${r.rama}. ${r.nota}`
    : `No se publicó: ${r.motivo || r.nota || r.error}`);
});

/* ═══ PIEZAS ═════════════════════════════════════════════════════
   Acá se cierra el circuito: generás, mirás, aprobás y subís. Antes
   había que ir a buscar los archivos a mano dentro de salida/.
   ════════════════════════════════════════════════════════════════ */

const ESTADOS = {
  borrador:  { texto: "sin revisar", clase: "" },
  aprobada:  { texto: "aprobada",    clase: "etiqueta--oro" },
  publicada: { texto: "publicada",   clase: "etiqueta--si" },
};

async function cargarPiezas() {
  mostrarLista();
  const { total, piezas } = await herramienta("listar_piezas");

  const sinRevisar = piezas.filter((p) => p.estado === "borrador").length;
  $("#piezas-resumen").textContent = total === 0
    ? "Todavía no generaste ninguna. Pedile una a HERALDO desde Conversar."
    : `${total} en total${sinRevisar ? `, ${sinRevisar} sin revisar` : ""}.`;

  $("#piezas-lista").innerHTML = piezas.map((p) => {
    const e = ESTADOS[p.estado] || ESTADOS.borrador;
    return `
      <div class="tarjeta tarjeta--clic" data-carpeta="${escapar(p.carpeta)}">
        <h3 class="tarjeta__t">${escapar(p.titular)}</h3>
        <div class="tarjeta__m">${escapar(p.carpeta)}</div>
        <div>
          <span class="etiqueta ${e.clase}">${e.texto}</span>
          <span class="etiqueta">${p.formato}</span>
          <span class="etiqueta">${p.audiencia}</span>
          <span class="etiqueta">${p.imagenes.length} ${p.imagenes.length === 1 ? "imagen" : "imágenes"}</span>
          ${p.instagram ? `<span class="etiqueta etiqueta--si">Instagram</span>` : ""}
          ${p.linkedin ? `<span class="etiqueta etiqueta--si">LinkedIn</span>` : ""}
          ${p.faltantes.length ? `<span class="etiqueta etiqueta--no">${p.faltantes.length} dato(s) sin completar</span>` : ""}
        </div>
      </div>`;
  }).join("");

  $$("#piezas-lista .tarjeta--clic").forEach((t) =>
    t.addEventListener("click", () => abrirPieza(t.dataset.carpeta)));
}

function mostrarLista() {
  if (location.hash.startsWith("#piezas/")) location.hash = "piezas";
  $("#piezas-lista").hidden = false;
  $("#pieza-detalle").hidden = true;
  $("#btn-volver-piezas").hidden = true;
  avisarPiezas("");
}

async function abrirPieza(carpeta) {
  const p = await herramienta("abrir_pieza", { carpeta });
  if (p.error) return avisarPiezas(p.error);

  const marcador = `piezas/${encodeURIComponent(carpeta)}`;
  if (location.hash.slice(1) !== marcador) location.hash = marcador;

  $("#piezas-lista").hidden = true;
  $("#pieza-detalle").hidden = false;
  $("#btn-volver-piezas").hidden = false;

  // Entrando por la dirección directa nunca pasamos por la lista, así que
  // el resumen se quedaba en "Cargando…" para siempre.
  $("#piezas-resumen").textContent = `Carpeta salida/${p.carpeta}`;

  const e = ESTADOS[p.estado] || ESTADOS.borrador;

  $("#pieza-detalle").innerHTML = `
    <div class="grupo">
      <h2 class="grupo__t">${escapar(p.titular)}</h2>
      <div style="margin-bottom:16px">
        <span class="etiqueta ${e.clase}">${e.texto}</span>
        <span class="etiqueta">${p.formato} · ${p.plantilla}</span>
        <span class="etiqueta">${p.audiencia}</span>
        <span class="etiqueta">${escapar(p.tema)}</span>
      </div>

      ${p.faltantes?.length ? `
        <p class="aviso aviso--no">Esta pieza tiene ${p.faltantes.length} dato(s) sin completar
        y salen entre corchetes en la imagen:\n· ${p.faltantes.map(escapar).join("\n· ")}</p>` : ""}

      <div class="galeria">
        ${(p.imagenes || []).map((img, i) => `
          <figure class="galeria__i">
            <img src="/salida/${encodeURIComponent(p.carpeta)}/${encodeURIComponent(img)}"
                 alt="Placa ${i + 1}" loading="lazy">
            <figcaption>${i + 1} / ${p.imagenes.length}</figcaption>
          </figure>`).join("")}
      </div>

      <div class="copy">
        <div class="copy__barra">
          <span class="grupo__t" style="border:0;margin:0;padding:0">Copy</span>
          <button class="boton boton--linea" id="btn-copiar">Copiar</button>
        </div>
        <pre class="copy__texto" id="copy-texto">${escapar(p.copy)}</pre>
      </div>

      ${p.instagram?.permalink ? `
        <p class="aviso aviso--si">Publicada en Instagram: ${escapar(p.instagram.permalink)}</p>` : ""}
      ${p.linkedin?.permalink ? `
        <p class="aviso aviso--si">Publicada en LinkedIn: ${escapar(p.linkedin.permalink)}</p>` : ""}

      <div class="acciones" style="margin-top:20px">
        <button class="boton boton--lleno" id="btn-aprobar"
                ${p.estado !== "borrador" ? "disabled" : ""}>Aprobar</button>
        <button class="boton boton--lleno" id="btn-instagram"
                ${p.estado === "borrador" || p.instagram ? "disabled" : ""}>Publicar en Instagram</button>
        <button class="boton boton--lleno" id="btn-linkedin"
                ${p.estado === "borrador" || p.linkedin ? "disabled" : ""}>Publicar en LinkedIn</button>
        <button class="boton boton--linea" id="btn-publicada"
                ${p.estado === "borrador" || p.estado === "publicada" ? "disabled" : ""}>Marcar como publicada</button>
        <button class="boton boton--linea" id="btn-descartar">Descartar</button>
      </div>

      <p class="sub" style="margin-top:14px">
        Fuentes: ${(p.fuentes || []).map(escapar).join(" · ") || "—"}
      </p>
    </div>`;

  $("#btn-copiar").addEventListener("click", async () => {
    const texto = $("#copy-texto").textContent;
    try {
      await navigator.clipboard.writeText(texto);
      $("#btn-copiar").textContent = "Copiado";
      setTimeout(() => ($("#btn-copiar").textContent = "Copiar"), 1600);
    } catch {
      // Sin permiso de portapapeles: lo seleccionamos para que copie a mano.
      const r = document.createRange();
      r.selectNodeContents($("#copy-texto"));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      avisarPiezas("El navegador no me deja copiar solo. Te lo dejé seleccionado: Ctrl+C.");
    }
  });

  $("#btn-aprobar").addEventListener("click", async () => {
    const r = await herramienta("aprobar_pieza", { carpeta });
    if (r.aprobada) { avisarPiezas("✓ Aprobada. Ya la podés subir."); abrirPieza(carpeta); }
    else avisarPiezas(r.motivo || r.error);
  });

  /* Publicar de verdad. Es lo único de toda la app que manda algo al
     mundo, así que pregunta qué se va a subir antes de hacerlo, y el
     botón se apaga mientras tanto: dos clics serían dos publicaciones. */
  $("#btn-instagram").addEventListener("click", async () => {
    const cuantas = (p.imagenes || []).length;
    const arranque = (p.copy || "").trim().split("\n")[0].slice(0, 70);

    const pregunta =
      `Se publica AHORA en tu cuenta de Instagram:\n\n` +
      `· ${cuantas} ${cuantas === 1 ? "imagen" : "imágenes"}${cuantas > 1 ? " en carrusel" : ""}\n` +
      `· Empieza con: «${arranque}…»\n\n` +
      `Sale al mundo y desde acá no se puede borrar.\n\n¿Publico?`;
    if (!confirm(pregunta)) return;

    const b = $("#btn-instagram");
    b.disabled = true;
    b.textContent = "Publicando…";
    avisarPiezas("Subiendo las imágenes y armando la publicación. Puede tardar medio minuto.");

    const r = await herramienta("publicar_en_instagram", { carpeta });

    if (r.publicada) {
      avisarPiezas("✓ Publicada." + (r.permalink ? ` Está en ${r.permalink}` : ""));
      abrirPieza(carpeta);
    } else {
      b.disabled = false;
      b.textContent = "Publicar en Instagram";
      avisarPiezas(r.motivo || r.error);
    }
  });

  /* LinkedIn. Un carrusel sale como PDF, que es el único formato que
     LinkedIn muestra deslizable, así que la confirmación lo aclara: no
     es lo mismo que va a Instagram. */
  $("#btn-linkedin").addEventListener("click", async () => {
    const esCarrusel = p.formato === "carrusel" && (p.placas || []).length > 1;
    const tieneCopyPropio = (p.copyLinkedin || "").trim().length > 0;

    const pregunta =
      `Se publica AHORA en LinkedIn:\n\n` +
      `· ${esCarrusel ? `Un PDF de ${p.placas.length} páginas` : `${(p.imagenes || []).length} imagen(es)`}\n` +
      `· ${tieneCopyPropio ? "Con el copy adaptado a LinkedIn" : "Con el copy de Instagram, hashtags incluidos"}\n\n` +
      (tieneCopyPropio ? "" : "Podés pedirle a HERALDO que lo adapte antes.\n\n") +
      `Sale al mundo y desde acá no se puede borrar.\n\n¿Publico?`;
    if (!confirm(pregunta)) return;

    const b = $("#btn-linkedin");
    b.disabled = true;
    b.textContent = "Publicando…";
    avisarPiezas(esCarrusel
      ? "Armando el PDF y subiéndolo. Puede tardar medio minuto."
      : "Subiendo a LinkedIn.");

    const r = await herramienta("publicar_en_linkedin", { carpeta });

    if (r.publicada) {
      avisarPiezas("✓ Publicada en LinkedIn." + (r.permalink ? ` Está en ${r.permalink}` : ""));
      abrirPieza(carpeta);
    } else {
      b.disabled = false;
      b.textContent = "Publicar en LinkedIn";
      avisarPiezas(r.motivo || r.error);
    }
  });

  $("#btn-publicada").addEventListener("click", async () => {
    const r = await herramienta("marcar_publicada", { carpeta });
    if (r.publicada) {
      avisarPiezas(`✓ Anotada en el historial. HERALDO no va a volver a proponer este tema.`);
      abrirPieza(carpeta);
    } else avisarPiezas(r.motivo || r.error);
  });

  $("#btn-descartar").addEventListener("click", async () => {
    if (!confirm("¿Borro esta pieza y sus imágenes? No se puede deshacer.")) return;
    const r = await herramienta("descartar_pieza", { carpeta });
    if (r.borrada) cargarPiezas(); else avisarPiezas(r.motivo || r.error);
  });
}

function avisarPiezas(texto) {
  const el = $("#piezas-aviso");
  el.textContent = texto;
  el.hidden = !texto;
}

$("#btn-volver-piezas").addEventListener("click", cargarPiezas);

/* ═══ CALENDARIO ═════════════════════════════════════════════════ */

let planPropuesto = null;

async function cargarPlan() {
  if (!$("#plan-mes").value) {
    // Por defecto, el mes que viene: planificar el actual a mitad de camino
    // no sirve de mucho.
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + 1);
    $("#plan-mes").value = d.toISOString().slice(0, 7);
  }

  const { total, proximas } = await herramienta("ver_calendario", { cuantas: 40 });

  $("#plan-lista").innerHTML = total === 0
    ? `<p class="sub">No hay nada agendado. Elegí un mes y pedí una propuesta.</p>`
    : `<div class="grupo">
         <h2 class="grupo__t">Agendado</h2>
         ${filasDePlan(proximas)}
       </div>`;
}

function filasDePlan(entradas) {
  return entradas.map((e) => `
    <div class="campo campo--plan">
      <div>
        <div class="campo__pregunta">${escapar(e.titulo || e.tema)}</div>
        <div class="campo__ayuda">
          <span class="etiqueta">${escapar(e.audiencia || "—")}</span>
          <span class="etiqueta">${escapar(e.rubro || "—")}</span>
          <span class="etiqueta">${escapar(e.formato || "—")}</span>
          ${(e.necesita || []).length ? `<span class="etiqueta etiqueta--no">faltan datos</span>` : ""}
        </div>
      </div>
      <div class="fecha">${escapar(e.fecha)}</div>
    </div>`).join("");
}

$("#btn-proponer").addEventListener("click", async () => {
  const [anio, mes] = ($("#plan-mes").value || "").split("-").map(Number);
  if (!anio || !mes) return avisarPlan("Elegí un mes primero.");

  avisarPlan("Armando la propuesta…");
  const r = await herramienta("planificar_mes", { anio, mes });
  if (r.error) return avisarPlan(r.error);

  planPropuesto = r.plan;
  $("#btn-agendar").disabled = r.plan.length === 0;

  avisarPlan(r.nota
    ? r.nota
    : `${r.propuestas} publicaciones para los ${r.diasDisponibles} días del mes. ` +
      `Alterna audiencia y rubro entre piezas seguidas.`);

  $("#plan-lista").innerHTML = `
    <div class="grupo">
      <h2 class="grupo__t">Propuesta · todavía no está agendada</h2>
      ${filasDePlan(r.plan)}
    </div>`;
});

$("#btn-agendar").addEventListener("click", async () => {
  if (!planPropuesto?.length) return;
  const r = await herramienta("agendar_plan", { plan: planPropuesto });
  if (r.error) return avisarPlan(r.error);
  planPropuesto = null;
  $("#btn-agendar").disabled = true;
  avisarPlan(`✓ Agendadas ${r.agendadas}. En total hay ${r.total} en el calendario.`);
  cargarPlan();
});

function avisarPlan(texto) {
  const el = $("#plan-aviso");
  el.textContent = texto;
  el.hidden = !texto;
}

/* ═══ TEMAS ══════════════════════════════════════════════════════ */

async function cargarTemas() {
  const { temas = [] } = await api("/api/temas");
  const sinUsar = temas.filter((t) => t.estado === "idea");

  $("#temas-resumen").textContent =
    `${sinUsar.length} sin usar de ${temas.length}. Ninguno inventado: todos salen del prompt maestro o del documento de alineación.`;

  $("#temas-lista").innerHTML = temas.map((t) => `
    <div class="tarjeta">
      <h3 class="tarjeta__t">${escapar(t.titulo)}</h3>
      <div class="tarjeta__m">${t.id}</div>
      <div>
        <span class="etiqueta ${t.estado === "idea" ? "etiqueta--oro" : ""}">${t.estado}</span>
        <span class="etiqueta">${t.audiencia}</span>
        <span class="etiqueta">${t.formato}</span>
        ${t.prioridad === "alta" ? `<span class="etiqueta etiqueta--oro">prioridad</span>` : ""}
        ${(t.necesita || []).length ? `<span class="etiqueta etiqueta--no">faltan datos</span>` : ""}
      </div>
      <p class="tarjeta__a" style="margin-top:10px">${escapar(t.angulo)}</p>
    </div>`).join("");
}

/* ═══ NOTAS ══════════════════════════════════════════════════════
   Sin esta pantalla no había forma de comprobar que una transcripción
   salió bien, ni de leer lo que se fue juntando.
   ════════════════════════════════════════════════════════════════ */

async function cargarNotas() {
  const [a, n] = await Promise.all([
    herramienta("listar_audios"),
    herramienta("listar_notas"),
  ]);

  const pendientes = a.pendientes || 0;
  $("#btn-transcribir").hidden = pendientes === 0;

  $("#notas-resumen").textContent =
    `${(n.notas || []).length} nota(s) · ${a.total} audio(s)` +
    (pendientes ? `, ${pendientes} sin transcribir` : "");

  $("#audios-lista").innerHTML = (a.audios || []).length === 0 ? "" : `
    <div class="grupo">
      <h2 class="grupo__t">Notas de voz</h2>
      ${a.audios.map((x) => `
        <div class="campo campo--audio">
          <div>
            <div class="campo__pregunta">${escapar(x.archivo)}</div>
            ${x.texto
              ? `<div class="campo__ayuda">${escapar(x.texto.slice(0, 220))}${x.texto.length > 220 ? "…" : ""}</div>`
              : `<div class="campo__ayuda">Todavía sin pasar a texto.</div>`}
          </div>
          <div>
            <span class="etiqueta ${x.transcrito ? "etiqueta--si" : "etiqueta--no"}">
              ${x.transcrito ? "transcrito" : "pendiente"}
            </span>
            <span class="etiqueta">${x.kb} kB</span>
          </div>
        </div>`).join("")}
    </div>`;

  $("#notas-lista").innerHTML = (n.notas || []).length === 0
    ? `<p class="sub">Todavía no hay notas. Mandale un audio o una idea al bot de Telegram, o pedile a HERALDO que guarde una.</p>`
    : `<div class="grupo">
         <h2 class="grupo__t">Lo que sabemos</h2>
         ${n.notas.map((x) => `
           <div class="tarjeta">
             <h3 class="tarjeta__t">${escapar(x.titulo)}</h3>
             <div class="tarjeta__m">${escapar(x.archivo)}</div>
             <p class="tarjeta__a">${escapar(cuerpoDeNota(x.texto)).slice(0, 600)}</p>
           </div>`).join("")}
       </div>`;
}

/** Saca el encabezado y los comentarios para mostrar sólo lo que se lee. */
function cuerpoDeNota(md) {
  return String(md || "")
    .replace(/^#.*$/m, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details>[\s\S]*?<\/details>/g, "")
    .trim();
}

$("#btn-transcribir").addEventListener("click", async () => {
  $("#btn-transcribir").disabled = true;
  avisarNotas("Transcribiendo… puede tardar bastante según el modelo.");

  const r = await herramienta("transcribir_audio");
  $("#btn-transcribir").disabled = false;

  if (!r.transcrito && r.motivo) return avisarNotas(r.motivo);

  const hechos = (r.hechos || []).length;
  const fallados = (r.fallados || []).length;
  avisarNotas(
    `✓ ${hechos} audio(s) pasados a texto.` +
    (fallados ? ` ${fallados} fallaron y quedan para el próximo intento.` : ""));
  cargarNotas();
});

function avisarNotas(texto) {
  const el = $("#notas-aviso");
  el.textContent = texto;
  el.hidden = !texto;
}

/* ═══ ESTADO ═════════════════════════════════════════════════════ */

async function cargarEstado() {
  const e = await api("/api/estado");

  const fila = (nombre, x, extra = "") => `
    <div class="tarjeta">
      <h3 class="tarjeta__t">${nombre}</h3>
      <span class="etiqueta ${x.activo ? "etiqueta--si" : "etiqueta--no"}">${x.activo ? "andando" : "apagado"}</span>
      ${extra}
      ${x.motivo ? `<p class="tarjeta__a" style="margin-top:10px">${escapar(x.motivo)}</p>` : ""}
    </div>`;

  $("#estado-lista").innerHTML = `
    <div class="grupo">
      <h2 class="grupo__t">Motores de texto</h2>
      ${fila("Claude · el chat de HERALDO", e.motores.claude,
             e.motores.claude.modelo ? `<span class="etiqueta">${e.motores.claude.modelo}</span>` : "")}
      ${fila("Ollama · local y gratis", e.motores.ollama,
             e.motores.ollama.modelo ? `<span class="etiqueta">${e.motores.ollama.modelo}</span>` : "")}
      ${fila("Plantillas · sin IA", e.motores.plantillas)}
    </div>
    <div class="grupo">
      <h2 class="grupo__t">Imágenes</h2>
      ${fila("Tipografías de la marca", e.fuentes,
             e.fuentes.activo ? `<span class="etiqueta">las 8 en su lugar</span>` : "")}
      ${fila("Renderizador", e.render,
             e.render.navegador ? `<span class="etiqueta">${e.render.navegador}</span>` : "")}
    </div>
    <div class="grupo">
      <h2 class="grupo__t">Voz</h2>
      ${fila("Transcripción de audios", e.audio,
             e.audio.motor ? `<span class="etiqueta">${e.audio.motor}</span><span class="etiqueta">${e.audio.modelo}</span>` : "")}
    </div>
    <div class="grupo">
      <h2 class="grupo__t">Respaldo</h2>
      <div class="tarjeta">
        <h3 class="tarjeta__t">Lo que todavía no está en el repositorio</h3>
        <span class="etiqueta ${e.respaldo.sinRespaldar ? "etiqueta--oro" : "etiqueta--si"}">
          ${e.respaldo.sinRespaldar ? `${e.respaldo.sinRespaldar} archivo(s) sin respaldar` : "todo respaldado"}
        </span>
        <span class="etiqueta">${e.respaldo.automatico ? "automático al cerrar" : "sólo a mano"}</span>
        ${e.respaldo.error ? `<p class="tarjeta__a" style="margin-top:10px">${escapar(e.respaldo.error)}</p>` : ""}
        ${e.respaldo.archivos.length ? `
          <p class="tarjeta__a" style="margin-top:10px">${e.respaldo.archivos.map(escapar).join("<br>")}</p>` : ""}
        <div class="acciones" style="margin-top:14px">
          <button class="boton boton--linea" id="btn-respaldar"
                  ${e.respaldo.sinRespaldar ? "" : "disabled"}>Respaldar ahora</button>
        </div>
        <p class="sub" style="margin-top:10px">
          Las notas, el historial, los temas, los datos de la página y las fichas de
          las piezas. Las imágenes no: se rehacen con <code>npm run rehacer</code>.
        </p>
      </div>
    </div>
    <div class="grupo">
      <h2 class="grupo__t">Publicación</h2>
      ${fila("Instagram", e.instagram,
             (e.instagram.diasRestantes ?? null) !== null
               ? `<span class="etiqueta ${e.instagram.diasRestantes < 10 ? "etiqueta--no" : ""}">token por ${e.instagram.diasRestantes} días</span>`
               : "")}
      ${e.instagram.aviso ? `<p class="aviso aviso--no">${escapar(e.instagram.aviso)}</p>` : ""}
      ${fila("LinkedIn", e.linkedin,
             e.linkedin.tipo ? `<span class="etiqueta">${escapar(e.linkedin.tipo)}</span>` +
               (e.linkedin.activo ? `<span class="etiqueta ${e.linkedin.diasRestantes < 10 ? "etiqueta--no" : ""}">acceso por ${e.linkedin.diasRestantes} días</span>` : "")
               : "")}
      ${e.linkedin.aviso ? `<p class="aviso aviso--no">${escapar(e.linkedin.aviso)}</p>` : ""}
      ${e.linkedin.necesitaConectar ? `
        <div class="acciones" style="margin-top:-8px;margin-bottom:20px">
          <button class="boton boton--lleno" id="btn-conectar-li">Conectar con LinkedIn</button>
        </div>` : ""}
    </div>
    <div class="grupo">
      <h2 class="grupo__t">Contenido</h2>
      <div class="tarjeta">
        <h3 class="tarjeta__t">Página</h3>
        <span class="etiqueta ${e.sitio.faltan ? "etiqueta--no" : "etiqueta--si"}">
          ${e.sitio.faltan ? `faltan ${e.sitio.faltan} de ${e.sitio.total}` : `los ${e.sitio.total} datos completos`}
        </span>
      </div>
      <div class="tarjeta">
        <h3 class="tarjeta__t">Banco de temas</h3>
        <span class="etiqueta etiqueta--oro">${e.temas.sinUsar} sin usar</span>
        <span class="etiqueta">${e.temas.total} en total</span>
      </div>
    </div>`;

  const conectar = $("#btn-conectar-li");
  if (conectar) conectar.addEventListener("click", async () => {
    const r = await herramienta("conectar_linkedin");
    if (r.error) return alert(r.error);
    // La vuelta cae en /linkedin/callback, que es este mismo servidor.
    window.open(r.url, "_blank", "noopener");
  });

  const btn = $("#btn-respaldar");
  if (btn) btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Respaldando…";
    const r = await api("/api/respaldar", {});
    if (r.respaldado) btn.textContent = `✓ ${r.total} archivo(s) a la rama ${r.rama}`;
    else if (r.sinCambios) btn.textContent = "No había nada";
    else { btn.textContent = "No se pudo"; alert(r.motivo || r.error); }
    setTimeout(cargarEstado, 2500);
  });
}

$("#btn-refrescar").addEventListener("click", cargarEstado);

/* ── Utilidades ────────────────────────────────────────────────── */

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// El estado se carga de entrada: si algo está apagado, conviene saberlo ya.
cargarEstado();

// Y si la dirección trae una pestaña, se abre esa.
if (location.hash.length > 1) irA(location.hash.slice(1));
