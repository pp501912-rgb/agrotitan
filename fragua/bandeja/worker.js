/* ═══════════════════════════════════════════════════════════════════
   BANDEJA DE CAPTURA · el único pedazo de FRAGUA que vive afuera.

   Un Worker de Cloudflare con una cola en KV. Desde el celular tirás
   una idea, una foto o un audio en el momento en que aparece, esté la
   PC prendida o apagada. Cuando abrís FRAGUA, baja todo, lo archiva en
   conocimiento/notas/ y vacía la cola.

   Es lo único que funciona con la computadora apagada. El bot de
   Telegram cubre casi lo mismo —Telegram guarda 24 horas de mensajes
   no entregados— así que esto recién gana sentido si estás más de un
   día lejos de la máquina.

   Despliegue, desde tu PC y una sola vez:
     npx wrangler kv namespace create BANDEJA
     (pegá el id que te da en wrangler.jsonc)
     npx wrangler secret put BANDEJA_TOKEN
     npx wrangler deploy

   La protección es un token en la cabecera. Para algo más serio,
   poné Cloudflare Access adelante y atalo a tu correo.
   ═══════════════════════════════════════════════════════════════════ */

const LIMITE_BYTES = 15 * 1024 * 1024;   // Telegram y las fotos entran holgados
const MAX_EN_COLA  = 500;

/* Las imágenes que se le muestran a Meta para publicar en Instagram
   viven una hora. Alcanza de sobra —Meta las busca en el momento— y
   así no queda nada dando vueltas aunque la publicación falle. */
const VIDA_IMAGEN = 60 * 60;

export default {
  async fetch(peticion, entorno) {
    const url = new URL(peticion.url);

    // La página de captura es pública; todo lo demás pide el token.
    if (peticion.method === "GET" && url.pathname === "/") {
      return new Response(PAGINA, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Y las imágenes también: Meta las viene a buscar sin credenciales.
    // La dirección es aleatoria y dura una hora, que es toda la
    // protección que necesita algo que está por publicarse igual.
    if (peticion.method === "GET" && url.pathname.startsWith("/i/")) {
      return servirImagen(url.pathname.slice(3), entorno);
    }

    if (!autorizado(peticion, entorno)) {
      return json({ error: "No autorizado." }, 401);
    }

    try {
      if (peticion.method === "POST" && url.pathname === "/api/guardar") {
        return guardar(peticion, entorno);
      }
      if (peticion.method === "GET" && url.pathname === "/api/cola") {
        return listar(entorno);
      }
      if (peticion.method === "POST" && url.pathname === "/api/vaciar") {
        return vaciar(peticion, entorno);
      }
      if (peticion.method === "POST" && url.pathname === "/i") {
        return guardarImagen(peticion, entorno);
      }
      if (peticion.method === "POST" && url.pathname === "/i/borrar") {
        return borrarImagenes(peticion, entorno);
      }
    } catch (e) {
      return json({ error: e.message }, 500);
    }

    return json({ error: "No existe esa ruta." }, 404);
  },
};

function autorizado(peticion, entorno) {
  const esperado = entorno.BANDEJA_TOKEN;
  if (!esperado) return false;

  const dado =
    peticion.headers.get("x-bandeja-token") ||
    new URL(peticion.url).searchParams.get("token");

  // Comparación de tiempo constante: sin esto, se puede adivinar el
  // token carácter por carácter midiendo cuánto tarda la respuesta.
  if (!dado || dado.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperado.length; i++) diferencia |= dado.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diferencia === 0;
}

const json = (datos, estado = 200) =>
  new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/** Guarda una captura en la cola. */
async function guardar(peticion, entorno) {
  const cuerpo = await peticion.json();
  const texto = String(cuerpo.texto || "").trim();
  const adjunto = cuerpo.adjunto || null;

  if (!texto && !adjunto) return json({ error: "Vacío." }, 400);
  if (JSON.stringify(cuerpo).length > LIMITE_BYTES) {
    return json({ error: "Demasiado grande." }, 413);
  }

  const listado = await entorno.BANDEJA.list({ prefix: "captura:" });
  if (listado.keys.length >= MAX_EN_COLA) {
    return json({ error: "La cola está llena. Abrí FRAGUA para bajarla." }, 429);
  }

  // La clave lleva el instante adelante: así list() las devuelve en orden.
  const clave = `captura:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
  await entorno.BANDEJA.put(clave, JSON.stringify({
    clave,
    fecha: new Date().toISOString(),
    titulo: String(cuerpo.titulo || "").trim() || texto.slice(0, 60),
    texto,
    adjunto,
  }));

  return json({ guardado: true, clave, enCola: listado.keys.length + 1 });
}

/** Devuelve todo lo pendiente, sin borrarlo. */
async function listar(entorno) {
  const { keys } = await entorno.BANDEJA.list({ prefix: "captura:" });
  const capturas = await Promise.all(
    keys.map(async (k) => JSON.parse(await entorno.BANDEJA.get(k.name)))
  );
  return json({ total: capturas.length, capturas });
}

/**
 * Borra las capturas que FRAGUA ya archivó.
 *
 * Se borra por clave y no "todo", a propósito: si mientras bajabas la
 * cola entró una captura nueva, un borrado total se la comería.
 */
async function vaciar(peticion, entorno) {
  const { claves = [] } = await peticion.json();
  await Promise.all(claves.map((c) => entorno.BANDEJA.delete(c)));
  return json({ borradas: claves.length });
}

/* ── Imágenes para publicar ────────────────────────────────────── */

/** Guarda una imagen y devuelve su dirección pública. */
async function guardarImagen(peticion, entorno) {
  const datos = await peticion.arrayBuffer();
  if (datos.byteLength === 0) return json({ error: "Vacía." }, 400);
  if (datos.byteLength > LIMITE_BYTES) return json({ error: "Demasiado grande." }, 413);

  const id = crypto.randomUUID().replace(/-/g, "");
  const tipo = peticion.headers.get("content-type") || "image/png";

  await entorno.BANDEJA.put(`imagen:${id}`, datos, {
    expirationTtl: VIDA_IMAGEN,
    metadata: { tipo, nombre: peticion.headers.get("x-bandeja-nombre") || "" },
  });

  const base = new URL(peticion.url).origin;
  return json({ id, url: `${base}/i/${id}`, vidaSegundos: VIDA_IMAGEN });
}

/** Sirve una imagen. Sin token: Meta la busca sin credenciales. */
async function servirImagen(id, entorno) {
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("No existe.", { status: 404 });

  const { value, metadata } = await entorno.BANDEJA.getWithMetadata(`imagen:${id}`, {
    type: "arrayBuffer",
  });
  if (!value) return new Response("No existe o ya caducó.", { status: 404 });

  return new Response(value, {
    headers: {
      "content-type": metadata?.tipo || "image/png",
      "cache-control": `public, max-age=${VIDA_IMAGEN}`,
    },
  });
}

/** Borra las que ya se publicaron. Las demás caducan solas. */
async function borrarImagenes(peticion, entorno) {
  const { ids = [] } = await peticion.json();
  await Promise.all(ids.map((id) => entorno.BANDEJA.delete(`imagen:${id}`)));
  return json({ borradas: ids.length });
}

/* ── La página de captura ──────────────────────────────────────────
   Se agrega a la pantalla de inicio y queda como una app. El token se
   guarda en el navegador, así no hay que escribirlo cada vez.
   ────────────────────────────────────────────────────────────────── */

const PAGINA = `<!doctype html>
<html lang="es-AR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0A0A0A">
<title>Bandeja · AgroTitan</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;background:#0A0A0A;color:#F5F3EE;
       font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
       display:flex;flex-direction:column;padding:24px 20px calc(24px + env(safe-area-inset-bottom))}
  h1{font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:#E5C158;margin:0 0 4px}
  p.s{color:rgba(245,243,238,.42);font-size:13px;margin:0 0 20px}
  textarea{flex:1;min-height:44vh;width:100%;background:#161614;color:#F5F3EE;
           border:1px solid rgba(245,243,238,.11);border-radius:4px;padding:14px;
           font:inherit;resize:none}
  textarea:focus{outline:none;border-color:#E5C158}
  button{width:100%;margin-top:14px;padding:16px;background:#1B4332;color:#F5F3EE;
         border:1px solid #2D6A4F;border-radius:4px;font:600 17px/1 inherit;
         letter-spacing:.05em;cursor:pointer}
  button:disabled{opacity:.5}
  #aviso{margin-top:12px;font-size:14px;color:rgba(245,243,238,.66);min-height:20px}
  input{width:100%;background:#161614;color:#F5F3EE;border:1px solid rgba(245,243,238,.11);
        border-radius:4px;padding:12px;font:inherit;margin-bottom:12px}
</style>
</head><body>
<h1>Bandeja</h1>
<p class="s">Tirá la idea acá. FRAGUA la levanta cuando abras la PC.</p>
<input id="token" type="password" placeholder="Token de acceso" autocomplete="current-password">
<textarea id="texto" placeholder="Lo que se te ocurrió…" autofocus></textarea>
<button id="enviar">Guardar</button>
<p id="aviso"></p>
<script>
  const $ = (s) => document.querySelector(s);

  // El token queda en este navegador y no sale de acá.
  try { $("#token").value = localStorage.getItem("bandeja-token") || ""; } catch {}
  if ($("#token").value) $("#token").style.display = "none";

  $("#enviar").addEventListener("click", async () => {
    const texto = $("#texto").value.trim();
    const token = $("#token").value.trim();
    if (!texto) return;

    $("#enviar").disabled = true;
    $("#aviso").textContent = "Guardando…";

    try {
      const r = await fetch("/api/guardar", {
        method: "POST",
        headers: { "content-type": "application/json", "x-bandeja-token": token },
        body: JSON.stringify({ texto }),
      });
      const d = await r.json();

      if (d.guardado) {
        try { localStorage.setItem("bandeja-token", token); } catch {}
        $("#token").style.display = "none";
        $("#texto").value = "";
        $("#aviso").textContent = "Guardado. Hay " + d.enCola + " esperando.";
      } else {
        $("#aviso").textContent = d.error || "No se pudo guardar.";
        $("#token").style.display = "";
      }
    } catch (e) {
      $("#aviso").textContent = "Sin conexión. Probá de nuevo.";
    } finally {
      $("#enviar").disabled = false;
    }
  });
</script>
</body></html>`;
