# FRAGUA

Community manager virtual y autogestión del sitio de AgroTitan.

Es una aplicación que corre **en tu computadora**. No hay servidor, no hay
cuenta que crear, no hay mensualidad. El contenido queda en archivos de texto
dentro de este repositorio, así que si algún día abandonás la app, todo lo que
hiciste sigue siendo tuyo y se puede abrir con cualquier editor.

Adentro vive **HERALDO**, con quien se conversa.

---

## Arrancar

**Windows:** doble clic en `iniciar.bat`.
**macOS o Linux:** `./iniciar.sh` desde la terminal.

Se abre solo en `http://127.0.0.1:4321`.

Lo único que hace falta de verdad es **Node.js 20 o más nuevo**
([nodejs.org](https://nodejs.org), versión LTS). Si no lo tenés, el script te
lo dice y no hace nada más.

**La app arranca sin configurar nada.** Cada cosa que falte se apaga sola y la
pantalla de *Estado* te dice qué falta y cómo resolverlo. Sin clave de Claude y
sin Ollama igual podés completar los datos de la página, generar piezas con las
plantillas y publicar el sitio.

---

## Lo que podés agregar después

### El chat de HERALDO · necesita una clave de Claude

1. Entrá a [console.anthropic.com](https://console.anthropic.com) → API Keys.
2. Pegala en `.env`, en `ANTHROPIC_API_KEY`.
3. `npm install` (una sola dependencia en todo el proyecto, y es ésta).

Se paga aparte y **no consume los límites de tu suscripción de Claude Code**.
Una sesión de trabajo de unos quince intercambios ronda los US$ 0,25 en el peor
caso; unas veinte sesiones al mes quedan en el orden de US$ 5.

### El motor gratis · Ollama

Corre en tu PC, no cuesta nada y no necesita internet. Sirve para el trabajo de
volumen: veinte titulares para elegir uno, reescribir un párrafo, digerir tus
notas, buscar en el conocimiento.

1. Instalá [Ollama](https://ollama.com).
2. En una terminal:
   ```
   ollama pull qwen3:8b
   ollama pull nomic-embed-text
   ```

Un modelo de ese tamaño necesita unos 5 GB de memoria libre.

### HERALDO en el celular · bot de Telegram

1. Escribile a **@BotFather** en Telegram y mandale `/newbot`. Dos minutos.
2. Pegá el token en `.env`, en `TELEGRAM_TOKEN`.
3. `npm run bot`
4. Escribile al bot. En la consola de tu PC va a aparecer tu *chat ID*.
   Pegalo en `TELEGRAM_AUTORIZADOS` y reiniciá el bot.

**Sin la lista de autorizados el bot no le contesta a nadie.** Es a propósito:
puede publicar en tu sitio.

Tu PC le pregunta a Telegram si hay mensajes; Telegram nunca le habla a tu PC.
No hay que abrir ningún puerto ni exponer nada a internet. Y como Telegram
guarda 24 horas los mensajes que no pudo entregar, si apagás la máquina a la
noche el bot los levanta a la mañana sin perder nada.

### La bandeja de captura

Sólo si te pasa seguido estar más de un día lejos de la PC. Ver
`bandeja/LEEME.md`.

---

## Las cuatro pantallas

**Conversar.** Le pedís lo que necesites. Puede buscar en lo que sabemos de
AgroTitan, escribir el copy, armar las placas, completar datos y publicar la
página. Debajo de cada respuesta se ve qué herramientas usó.

**Datos de la página.** Los 31 datos que la página necesita y todavía no
tenemos, como formulario. Se guarda solo al salir de cada campo. Mientras
falten, la página los muestra entre corchetes y el publicador se niega a
subirla salvo que se lo pidas.

**Temas.** El banco de ideas. Arranca con 17 temas que se pueden producir hoy,
sin ningún dato nuevo: las diez variables que definen el resultado en cada
sistema productivo, más siete temas del documento de alineación.

**Estado.** Qué está andando y qué no, y por qué.

---

## La regla que gobierna todo

**Ningún dato que no esté en los archivos se inventa.**

Ni una cifra, ni un año, ni una superficie, ni un precio. Si hace falta y no
está, va entre corchetes y se reporta como faltante.

No es una recomendación: está verificada por código. Una pieza con corchetes
en el texto y la lista de faltantes vacía se rechaza y no se guarda. En un
negocio cuyo activo es la credibilidad numérica, un solo número inventado
destruye exactamente lo que se está vendiendo.

---

## Comandos

```
npm start                            el panel (lo mismo que iniciar.bat)
npm run bot                          el bot de Telegram
npm run probar                       las pruebas
node sitio/construir.mjs --verificar compara la página con la maqueta
node sitio/publicar.mjs --simulacro  muestra qué publicaría, sin tocar nada
node sitio/extraer.mjs               rehace la plantilla si editaste la maqueta
```

---

## Cómo está armado

```
conocimiento/     lo que HERALDO sabe. Texto plano, editable a mano.
  PROMPT-MAESTRO.txt   el cerebro de marca
  temas.json           el banco de ideas
  glosario.md          cada término, explicado para inversor y para productor
  hashtags.json        los sets curados
  historial.json       qué se publicó, para no repetirse
  notas/               lo que le vas contando

contenido/        los datos de la página
plantillas/       la página con marcadores
piezas/           las cuatro plantillas de Instagram
nucleo/           render, plantillas, contrato, conocimiento
motores/          claude, ollama, plantillas
servidor/         el servidor, el agente y sus herramientas
panel/            la interfaz
sitio/            extraer, construir, publicar
telegram/         el bot
bandeja/          el Worker de Cloudflare
salida/           las piezas generadas (no se versiona)
```

**Una sola dependencia de npm en todo el proyecto**, `@anthropic-ai/sdk`, y es
opcional. Todo lo demás usa lo que Node ya trae: el servidor es `node:http`, a
Ollama y a Telegram se les habla con `fetch`, y las imágenes las renderiza el
navegador que ya tenés instalado —en Windows, Edge— en modo headless. No hay
paso de compilación ni nada que descargar.

---

## Si algo no anda

**«El puerto 4321 ya está en uso.»** Probablemente ya tenés FRAGUA abierta en
otra ventana. Entrá a `http://127.0.0.1:4321`. Si querés otro puerto, poné
`FRAGUA_PUERTO=4322` en el `.env`.

**«No encontré Chrome, Edge ni Chromium.»** Poné la ruta a mano en el `.env`:
`FRAGUA_NAVEGADOR=C:\ruta\a\chrome.exe`.

**Las piezas salen con otra tipografía.** Faltan los archivos de
`public/fuentes/`. La pieza igual se genera, pero con la tipografía del sistema.

**El chat dice que el motor está apagado.** Falta la clave en el `.env` o falta
`npm install`. La pantalla de *Estado* te dice cuál de las dos.

---

## Lo que todavía no hace

- **Publicar solo en Instagram.** El paquete queda listo en `salida/` y se sube
  a mano. El código está preparado para enchufar la API de Meta más adelante.
- **Transcribir audios.** Las notas de voz de Telegram se archivan pero no se
  transcriben todavía; hace falta instalar Whisper.
- **Calendario editorial.** Está en el plan, no está construido.
- **Fotos propias.** Las piezas usan composiciones tipográficas hasta que
  existan fotos reales de campo.
