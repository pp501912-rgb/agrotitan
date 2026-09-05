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

### Pasar las notas de voz a texto · Whisper

Sin esto el bot guarda los audios igual y no se pierde nada; cuando
instales Whisper, `npm run transcribir` levanta todos los que se hayan ido
juntando.

**La forma simple**, un solo comando:

```
pip install whisper-ctranslate2
```

Se baja el modelo solo la primera vez y entiende las notas de voz de Telegram
sin nada más.

**Si preferís no usar Python:** bajá `whisper-bin-x64.zip` de
[las versiones de whisper.cpp](https://github.com/ggml-org/whisper.cpp/releases)
y un modelo `.bin`. Ojo con un detalle: **whisper.cpp no lee el formato Opus en
que Telegram manda las notas de voz**, así que también hace falta ffmpeg para
convertirlas. Las tres rutas van en el `.env`.

El modelo por defecto es `small`. Para español rioplatense grabado manejando es
el piso razonable; `large-v3-turbo` es lo mejor si la máquina da.

### La bandeja de captura

Sólo si te pasa seguido estar más de un día lejos de la PC. Ver
`bandeja/LEEME.md`.

### Publicar solo en Instagram

Lo último y lo más opcional de todo. Subir una pieza a mano lleva treinta
segundos, y es el momento en que la mirás por última vez. Esto ahorra eso.

Necesita la bandeja desplegada —es la que le muestra las imágenes a Meta
mientras publica— y una app de Meta, que se arma una sola vez:

1. En `developers.facebook.com`, **crear una app**. Cuando pregunte el caso de
   uso, elegí *Otro* y después el tipo **Empresa**.
2. Agregarle el producto **Instagram**, en la variante con inicio de sesión de
   Instagram. **No hace falta página de Facebook**: la vía nueva acepta cuentas
   que sólo existen en Instagram, y la tuya ya es profesional.
3. En *Roles*, agregar tu propia cuenta como **Instagram Tester**, y aceptar la
   invitación desde Instagram (Configuración → Apps y sitios web → Invitaciones
   de tester).
4. Generar un **token de larga duración** y copiar el **ID de la cuenta**, que
   sale en la misma pantalla.
5. Pegar los dos en el `.env`, en `IG_TOKEN` e `IG_CUENTA`.

**No hace falta la revisión de Meta**, que tarda de dos a cuatro semanas: sólo
aplica si publicás en cuentas ajenas. Para la tuya, con la app en modo
desarrollo alcanza.

**El token dura 60 días y se renueva solo.** FRAGUA lo refresca en cada
arranque, así que con abrir la app una vez cada dos meses no se vence nunca. La
pantalla de *Estado* avisa cuando faltan menos de diez días. Si igual se vence,
no hay refresco posible: hay que repetir el paso 4 y pegar el token nuevo.

El token vivo se guarda en `fragua/.instagram.json`, que no va al repositorio.

---

## Las siete pantallas

**Conversar.** Le pedís lo que necesites. Puede buscar en lo que sabemos de
AgroTitan, escribir el copy, armar las placas, completar datos y publicar la
página. Debajo de cada respuesta se ve qué herramientas usó.

**Datos de la página.** Los 31 datos que la página necesita y todavía no
tenemos, como formulario. Se guarda solo al salir de cada campo. Mientras
falten, la página los muestra entre corchetes y el publicador se niega a
subirla salvo que se lo pidas.

**Piezas.** Todo lo que generaste, lo más nuevo arriba. Al abrir una ves las
imágenes, el copy con un botón para copiarlo entero, y cuatro acciones: aprobar,
publicar en Instagram, marcar como publicada y descartar. **Una pieza con datos
entre corchetes no se puede aprobar**, y te dice cuáles faltan.

*Publicar en Instagram* sube la pieza de verdad, y sólo funciona con una pieza
ya aprobada: como una pieza con corchetes no se puede aprobar, la regla de oro
llega intacta hasta el último paso. Pregunta qué va a subir antes de hacerlo. Si
Meta corta a la mitad, la pieza queda aprobada y se puede reintentar: nunca
queda marcada como publicada algo que no salió.

*Marcar como publicada* es para cuando la subiste a mano: la anota en el
historial y pasa el tema a «publicado», así HERALDO no vuelve a proponerlo.

**Ninguno de estos botones está entre las herramientas de HERALDO**, a
propósito. El modelo arma la pieza; aprobarla y mandarla al mundo son
decisiones tuyas.

**Temas.** El banco de ideas. Arranca con 17 temas que se pueden producir hoy,
sin ningún dato nuevo: las diez variables que definen el resultado en cada
sistema productivo, más siete temas del documento de alineación.

**Calendario.** Elegís un mes y pedís una propuesta. El planificador reparte los
temas sin usar alternando audiencia y rubro entre publicaciones seguidas —
promediar los dos mensajes produce un texto tibio, así que cada pieza elige un
carril. Si el banco no alcanza para el mes, te dice con cuántos días se queda
corto. *Agendar* es un paso aparte: la propuesta no se guarda sola.

**Notas.** Lo que HERALDO fue aprendiendo, y las notas de voz con su
transcripción. Los audios sin pasar a texto se ven aparte, con un botón para
hacerlos todos de una.

**Estado.** Qué está andando y qué no, y por qué. Y el respaldo: cuántos
archivos todavía no salieron de esta máquina, con un botón para empujarlos ya.

---

## Que no se pierda nada

FRAGUA escribe adentro del repositorio, así que la regla es simple:

> **Lo que se puede volver a calcular se ignora. Lo que no, se versiona.**

Un PNG se rehace desde su ficha en dos segundos, así que las imágenes quedan
fuera del repositorio. Una nota de voz que dictaste manejando no se rehace con
nada, así que va adentro.

**Se respalda:** las notas y sus transcripciones, el banco de temas, el
historial de lo publicado, los datos de la página, y de cada pieza su ficha y su
copy.

**No se respalda:** las imágenes (`npm run rehacer` las trae de vuelta), el
`.env` y los tokens, porque son secretos.

**Cuándo.** Al cerrar con Ctrl+C, que es cuando se sabe que terminaste. Al
arrancar te avisa si quedó algo pendiente, pero no lo empuja solo. Y hay un
botón **Respaldar ahora** en *Estado*. Si preferís que nunca lo haga solo, poné
`FRAGUA_RESPALDO=manual` en el `.env`.

**Cambiar de computadora**, entonces, es:

```
git clone <el repositorio>
cd fragua
npm run fuentes          las tipografías
npm run rehacer          las imágenes de las piezas
```

Más copiar el `.env`, que no está en el repositorio porque tiene las claves.
Guardalo en tu gestor de contraseñas. Los tokens de Instagram no hace falta
guardarlos: se vuelven a sacar.

---

## El modo cascada

Es donde el híbrido ahorra de verdad. Para un texto trabajado, Ollama produce
ocho borradores en tu PC —gratis— y Claude los recibe **todos en una sola
llamada corta**, elige el mejor y lo pule. Se paga una llamada en lugar de ocho
y la calidad final la pone Claude igual.

La regla detrás es la misma de todo el proyecto: **Claude donde el error se ve,
Ollama donde el error se descarta.**

Si Ollama no está instalado no falla: escribe directo con Claude y te avisa que
no hubo cascada.

Hay además un **modo espejo** que produce lo mismo con los dos motores, lado a
lado. No es un capricho: es cómo vas a descubrir en qué tipos de pieza Ollama ya
te alcanza, para moverlas al motor gratis con criterio en lugar de por
corazonada.

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
npm run transcribir                  pasa a texto los audios pendientes
npm run rehacer                      rehace las imágenes que falten
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
    audios/              las notas de voz, que nunca se borran

contenido/        los datos de la página
plantillas/       la página con marcadores
piezas/           las cuatro plantillas de Instagram
nucleo/           render, plantillas, contrato, conocimiento, piezas,
                  calendario, transcribir, audios, vitrina, git, respaldo
motores/          claude, ollama, plantillas, cascada, instagram
servidor/         el servidor, el agente y sus herramientas
panel/            la interfaz
sitio/            extraer, construir, publicar
telegram/         el bot
bandeja/          el Worker de Cloudflare
salida/           las piezas generadas. Las fichas y los copys se
                  versionan; las imágenes no, se rehacen.
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

**«Encontré whisper.cpp, pero no lee el Opus…»** Las notas de voz de Telegram
vienen en un formato que whisper.cpp no abre. Instalá ffmpeg y poné su ruta en
`FRAGUA_FFMPEG`, o pasate a whisper-ctranslate2, que no lo necesita.

**«El token de Instagram se venció.»** Pasaron más de 60 días sin abrir FRAGUA
y ya no se puede refrescar. Generá uno nuevo en `developers.facebook.com` y
pegalo en el `.env`: el guardado se descarta solo cuando cambia el del `.env`.

**«Para publicar en Instagram hace falta la bandeja desplegada.»** Meta va a
buscar las imágenes a una dirección pública; la bandeja es la que se las
muestra, y las borra apenas termina. Los tres comandos están en
`bandeja/LEEME.md`.

**El chat dice que el motor está apagado.** Falta la clave en el `.env` o falta
`npm install`. La pantalla de *Estado* te dice cuál de las dos.

---

## Lo que todavía no hace

- **Reels y videos.** Es otro flujo, con subida reanudable. Las piezas de
  AgroTitan son placas y carruseles.
- **Publicar a una hora programada.** El calendario dice qué día va cada pieza;
  apretar el botón sigue siendo un acto tuyo.
- **Publicar en cuentas que no sean la tuya.** Eso sí necesita la revisión de
  Meta.
- **Fotos propias.** Las piezas usan composiciones tipográficas hasta que
  existan fotos reales de campo.
