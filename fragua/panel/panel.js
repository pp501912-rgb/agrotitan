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

function irA(vista) {
  const boton = $(`.pestana[data-vista="${vista}"]`);
  if (!boton) return;

  $$(".pestana").forEach((x) => x.classList.remove("pestana--activa"));
  $$(".vista").forEach((x) => x.classList.remove("vista--activa"));
  boton.classList.add("pestana--activa");
  $(`#vista-${vista}`).classList.add("vista--activa");
  location.hash = vista;

  if (vista === "datos")  cargarDatos();
  if (vista === "temas")  cargarTemas();
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
      ${fila("Renderizador", e.render,
             e.render.navegador ? `<span class="etiqueta">${e.render.navegador}</span>` : "")}
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
