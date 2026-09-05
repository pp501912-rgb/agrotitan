# La primera prueba

Una hora, en la PC, sin necesitar todavía los números del proyecto.

La idea es que salgas de acá con tres certezas: que la app arranca, que genera
una pieza de verdad, y que **se niega a inventar un dato**. Esa última es la más
importante de las tres.

---

## Antes de empezar

Hace falta **Node 20 o más nuevo** (`node --version`) y **Edge, Chrome o
Chromium** instalado, que en Windows ya está. Nada más es obligatorio.

```
git clone <el repositorio>
cd agrotitan/fragua
npm install
```

`npm install` baja una sola cosa, el SDK de Claude, y es opcional: si falla, todo
lo demás anda igual.

---

## Paso 1 · Las tipografías

```
npm run fuentes
```

Tiene que decir ocho líneas con tilde y terminar en *«8 tipografía(s)
guardadas»*. Necesita internet ese rato y nunca más: después el sitio no le pide
nada a nadie, que es justamente el punto.

> **Si falla:** el mensaje te dice los nombres exactos de los archivos. Se pueden
> bajar a mano de `github.com/IBM/plex` y `fonts.google.com/specimen/Rajdhani` y
> dejarlos en `public/fuentes/`.

---

## Paso 2 · La clave

Copiá `.env.ejemplo` como `.env` y completá **una sola línea**:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Se saca de `console.anthropic.com` → API Keys. Se paga aparte y no consume los
límites de tu suscripción.

Todo lo demás del `.env` es opcional y podés dejarlo vacío.

> **Guardá el `.env` en tu gestor de contraseñas.** Es lo único del proyecto que
> no está en el repositorio, a propósito.

---

## Paso 3 · Arrancar

**Windows:** doble clic en `iniciar.bat`. **Mac o Linux:** `./iniciar.sh`.

Tiene que salir el cartel. Leelo: te dice qué quedó encendido y qué no.

```
  Motores
    Claude (el chat) ....... sí
    Ollama (local) ......... no   ← normal, es opcional
    Plantillas ............. sí
    Render de imágenes ..... sí  · msedge.exe
    Transcripción de voz ... no   ← normal, es opcional
    Instagram .............. no   ← normal, es un trámite aparte
    LinkedIn ............... no   ← normal, es un trámite aparte

  Página: faltan 31 de 31 datos.
  Temas sin usar: 17 de 17.
```

**Lo único que importa acá:** *Claude* y *Render de imágenes* en «sí». Si el
render dice que no, poné la ruta del navegador en el `.env`, en
`FRAGUA_NAVEGADOR`.

Abrí `http://127.0.0.1:4321`.

---

## Paso 4 · Una pieza que sale entera

En *Conversar*, pedile:

> Armá una pieza de cita para inversor sobre por qué el mayor margen bruto
> puede ser la peor opción.

**Una cita no lleva cifras**, así que sale completa sin ningún dato tuyo. Debajo
de la respuesta vas a ver qué herramientas usó: buscar en el conocimiento,
revisar el contrato de marca, guardar la pieza.

Andá a *Piezas*. Tiene que estar arriba de todo, con su imagen de 1080 × 1350.
Miralas: **la tipografía tiene que ser la de la marca**, Rajdhani en el titular.
Si se ve con letra de sistema, faltó el paso 1.

Apretá **Aprobar**.

---

## Paso 5 · El momento que importa

Ahora pedile lo contrario:

> Armá una pieza de dato con la superficie promedio de los proyectos que
> evaluamos.

**No lo puede inventar.** Ese número no está en ningún archivo, así que HERALDO
tiene que preguntártelo, o dejarlo marcado como `[superficie promedio]` y
avisarte que falta. Cualquiera de las dos está bien; inventarlo, no.

Esa es la regla de oro, y no depende de que el modelo se porte bien. Está
sostenida en tres lugares del código:

1. Si la pieza trae algo entre corchetes y el modelo **no lo declaró** como
   faltante, `nucleo/contrato.mjs` la rechaza y no se guarda nada.
2. Si lo declaró, la pieza se guarda pero **no se puede aprobar**, y el panel te
   dice cuáles son los datos que faltan.
3. Y como publicar exige que esté aprobada, nada con un corchete adentro puede
   llegar a Instagram ni a LinkedIn.

Probá también a insistirle. Podés pedirle que lo estime, que ponga un número
aproximado, que use un promedio del sector: tiene que seguir sin inventarlo.

---

## Paso 6 · La página

```
node sitio/construir.mjs --verificar
```

Tiene que decir *«La página reconstruida es idéntica a la maqueta»*. Eso
confirma que la plantilla y la maqueta no se separaron.

Después, en el panel, andá a *Datos de la página*: están los 31 datos que faltan,
como formulario, cada uno con su pregunta. **Ahí van los números cuando los
tengas.** Se guardan solos al salir de cada campo.

Mientras falten, el publicador se niega a subir la página. Es a propósito.

---

## Paso 7 · Cerrar

**Ctrl+C** en la ventana negra.

```
  Respaldando 3 archivo(s) antes de cerrar…
  ✓ 3 archivo(s) empujados a la rama claude/nueva-app-owy4qy.
```

Eso es lo que hace que nada de lo que hiciste viva sólo en esa máquina: las
notas, el historial, los temas, los datos cargados y las fichas de las piezas
quedan en el repositorio. Las imágenes no —se rehacen con `npm run rehacer`— y
el `.env` tampoco, porque tiene la clave.

Si preferís que nunca empuje solo, poné `FRAGUA_RESPALDO=manual` en el `.env` y
usá el botón **Respaldar ahora** en *Estado*.

---

## Qué mirar si algo sale distinto

| Lo que ves | Qué pasó |
|---|---|
| «El puerto 4321 ya está en uso» | Ya tenés FRAGUA abierta en otra ventana. |
| Las placas con letra del sistema | Faltó `npm run fuentes`. |
| «No encontré Chrome, Edge ni Chromium» | Poné la ruta en `FRAGUA_NAVEGADOR`. |
| El chat dice que el motor está apagado | Falta la clave en el `.env`. |
| Una pieza sale con `[algo entre corchetes]` | Está bien: es un dato que falta y te lo está señalando. |

Todo lo demás está en el `LEEME.md`.

---

## Después de la prueba

Tres cosas quedan por hacer, en este orden:

1. **Los 31 datos.** Es lo único que bloquea publicar la página.
2. **Instagram**, si querés que suba solo. Es un trámite de una tarde y no
   necesita revisión de Meta. Está en el `LEEME.md`.
3. **LinkedIn.** Con tu perfil personal anda el mismo día; con la página de
   empresa hay que esperar a que LinkedIn apruebe, que son semanas. Podés
   arrancar con el perfil y cambiar una línea el día que contesten.

Nada de eso es urgente. Con lo de arriba andando ya podés generar contenido y
subirlo a mano, que es como venías trabajando.
