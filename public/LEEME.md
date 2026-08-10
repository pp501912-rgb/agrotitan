# AgroTitan — el sitio web

Sitio estático. Sin frameworks, sin servidor, sin base de datos, sin
costo. Se abre con doble click y funciona.

---

## Para verlo ahora

Doble click en **`index.html`**. Se abre en el navegador. Eso es todo.

Si querés verlo como lo va a ver un visitante (con los scripts
funcionando del todo), abrí una terminal en esta carpeta y:

```bash
python -m http.server 8765
```

Después entrá a `http://localhost:8765` en el navegador. Para cortarlo,
`Ctrl+C`.

---

## ⚠ Lo que hay que completar antes de publicar

Son **dos datos**, en un solo archivo: `js/contacto.js`, arriba de todo.

```javascript
const WHATSAPP = "5490000000000";        // ← tu número
const EMAIL = "contacto@agrotitan.com";  // ← tu correo
```

**El número va en formato internacional, solo números.**
Argentina: `54` + `9` + código de área **sin el 0** + número **sin el 15**.

Ejemplo: el teléfono `(0351) 15-123-4567` se escribe `5493511234567`.

Si te olvidás, el sitio te avisa: abrí la consola del navegador (`F12`)
y vas a ver el recordatorio.

### Después, opcional

| Qué | Dónde |
|---|---|
| Elegir el otro isotipo | En `index.html`, cambiar `img/isotipo-a.svg` por `img/isotipo-columna.svg` (aparece 3 veces) |
| Fotos reales | Ver `img/LEEME-IMAGENES.md` |
| Redes sociales | En `index.html`, buscar "REEMPLAZAR o BORRAR" |
| Textos | `contenido.yaml` **y** `index.html` (ver abajo por qué los dos) |

---

## Cómo publicarlo gratis

### Opción recomendada: Cloudflare Pages

Gratis, sin límite de visitas, con HTTPS y un subdominio incluido.

1. Creá una cuenta en [dash.cloudflare.com](https://dash.cloudflare.com)
   (gratis, no pide tarjeta).
2. Subí esta carpeta `web/` a un repositorio de GitHub.
3. En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
4. Elegí el repositorio. Cuando pregunte por el *build command*,
   **dejalo vacío**: no hay nada que compilar.
5. En *build output directory* poné `web` (o `/` si subiste solo el
   contenido de esta carpeta).
6. Listo. Queda en `tunombre.pages.dev`.

Cada vez que hagas `git push`, el sitio se actualiza solo.

### Alternativa: GitHub Pages

Más simple todavía si ya tenés GitHub: en el repositorio, **Settings →
Pages → Deploy from a branch**. Queda en `usuario.github.io/repo`.

### Dominio propio

Cuando quieras un `agrotitan.com.ar`, se compra (unos pocos dólares al
año) y se conecta desde el panel de Cloudflare. **El sitio no cambia en
nada** — es solo apuntar el nombre.

---

## Por qué el formulario no tiene "enviar de verdad"

El formulario **no manda nada a ningún servidor**. Toma lo que escribió
el visitante, arma un mensaje redactado y lo abre en WhatsApp o en su
correo.

Es una decisión, no una limitación:

- **El mensaje va directo del cliente a vos.** Con un formulario común
  (Formspree, Netlify Forms) el mensaje pasa antes por una empresa
  ajena, que lo lee y lo guarda.
- **No hay nada que configurar ni que pagar.**
- **No se puede romper.** Un servicio de formularios puede cerrar,
  cambiar de precio o llenarse la cuota gratuita. WhatsApp y el correo
  no.
- **Coherente con TITANOMAQUIA.** El sistema que atiende tu empresa es
  local-first: los datos no salen de tu máquina. Sería incoherente que
  la web los mandara a un tercero.

---

## Cómo se conecta con TITANOMAQUIA

**No se conectan por red. Se conectan por un archivo.**

```
VISITANTE  ──WhatsApp/correo──▶  VOS  ──.eml──▶  TITANOMAQUIA
(este sitio)                 (tu casilla)      (tu máquina)
```

La consulta te llega a vos. Cuando la guardás como `.eml` en la carpeta
de consultas, **AG-011** la lee y clasifica, **AG-012** crea la ficha del
cliente y **AG-013** te prepara el borrador de respuesta.

Vos lo revisás y lo enviás. El sistema no envía: tiene prohibido hacerlo
(ART-35).

---

## Por qué el texto está en dos lugares

El texto vive en `contenido.yaml` **y** en `index.html`. Parece
duplicado. No lo es del todo:

- `index.html` es lo que ve el visitante.
- `contenido.yaml` es lo que **lee TITANOMAQUIA** para saber qué
  ofrecés públicamente. Cuando AG-013 prepare una propuesta, va a usar
  las mismas palabras que están en tu web.

**Si cambiás un texto, cambialo en los dos.** Es la única tarea manual
que quedó, y es a propósito: la alternativa era generar el HTML con un
script, y eso agrega una herramienta más que puede romperse.

---

## Estructura

```
web/
├── index.html          la página completa, 8 secciones
├── articulo.html       plantilla para artículos del blog
├── contenido.yaml      ✱ todo el texto, legible por TITANOMAQUIA
├── css/
│   ├── base.css        colores, tipografía, botones, reset
│   └── secciones.css   estilos de cada sección
├── js/
│   ├── contacto.js     ⚠ acá van tu WhatsApp y tu correo
│   └── navegacion.js   menú móvil y barra
├── img/                isotipos y fotos
└── fuentes/            tipografías (opcional, ver abajo)
```

---

## Las tipografías

El sitio usa **Rajdhani** (títulos) y **EB Garamond** (texto). Si la
carpeta `fuentes/` está vacía, usa las del sistema: se ve distinto pero
funciona perfecto.

Para instalarlas —recomendado, porque mejora bastante el aspecto:

1. Bajalas de [fonts.google.com](https://fonts.google.com) (son gratis,
   licencia OFL).
2. Convertilas a `.woff2` en
   [cloudconvert.com](https://cloudconvert.com) si vienen en `.ttf`.
3. Guardalas en `fuentes/` con estos nombres exactos:
   - `rajdhani-600.woff2`
   - `rajdhani-700.woff2`
   - `ebgaramond-400.woff2`
   - `ebgaramond-500italic.woff2`

**No se enlazan desde Google Fonts a propósito.** Si lo hiciéramos,
Google vería la dirección IP de cada visitante tuyo, y el sitio cargaría
más lento con señal débil — justo el problema de alguien que entra desde
el campo.

---

## Qué NO tiene este sitio, y por qué

| No tiene | Por qué |
|---|---|
| Google Analytics | Vería a tus visitantes y obligaría a un cartel de cookies |
| Cookies | No hay nada que guardar |
| Chat ni bot | Expondría el sistema de atención a internet |
| Base de datos | No hay nada que almacenar en la nube |
| Framework | Un `npm install` que hoy anda, en dos años no compila |

**Resultado:** el sitio no hace **ni una sola petición a un servidor
ajeno**. Podés verificarlo: `F12` → pestaña **Red** → recargar. Todo lo
que aparece sale de tu propio dominio.

---

## Verificado

- Sin desborde horizontal desde 280 px hasta 1280 px de ancho
- Todos los botones y campos con área táctil de 44 px o más
- Cero peticiones externas
- El formulario valida y arma el mensaje correctamente
- Funciona sin conexión a internet
