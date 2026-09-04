# Bandeja de captura

Lo único de FRAGUA que vive fuera de tu PC. Sirve para tirar una idea
desde el celular cuando la computadora está apagada.

## ¿Hace falta?

Para capturar ideas, probablemente no al principio. **El bot de Telegram
cubre casi lo mismo**, porque Telegram guarda 24 horas los mensajes que no
pudo entregar: si apagás la PC a la noche y la prendés a la mañana, el bot
los levanta solo. Esto recién gana sentido si te pasa seguido estar más de
un día lejos de la máquina y se te escapan ideas.

**Para publicar en Instagram, sí hace falta**, y ahí no hay alternativa:
Meta va a buscar las imágenes a una dirección pública y no acepta que se
las suban directo. Esa es la otra mitad de este Worker.

## Puesta en marcha

Desde esta carpeta, una sola vez:

```
npx wrangler kv namespace create BANDEJA
```

Te devuelve un `id`. Pegalo en `wrangler.jsonc`, donde dice
`PEGAR_EL_ID_ACA`.

```
npx wrangler secret put BANDEJA_TOKEN
```

Inventá una contraseña larga. Es la que vas a escribir una vez en el
celular; después queda guardada en ese navegador.

```
npx wrangler deploy
```

Te da una dirección. Abrila en el celular, escribí el token, y agregala
a la pantalla de inicio.

## Cómo se baja a la PC

Cuando abrís FRAGUA, si `BANDEJA_URL` y `BANDEJA_TOKEN` están en el
`.env`, la app consulta la cola, archiva cada captura en
`conocimiento/notas/` y borra sólo las que archivó.

Se borra por clave y no "todo", a propósito: si mientras bajabas la cola
entró una captura nueva, un borrado total se la comería.

## La otra mitad: las imágenes para Instagram

Cuando apretás *Publicar en Instagram* en el panel, FRAGUA sube cada placa
acá con `POST /i` (con token) y le pasa a Meta la dirección `GET /i/<id>`,
que es pública porque Meta la busca sin credenciales. El `id` es aleatorio
de 32 caracteres.

Apenas termina de publicar, FRAGUA las borra. Y si algo falla y no llega a
borrarlas, **caducan solas en una hora**: se guardan con `expirationTtl`,
así que no queda nada dando vueltas aunque nos olvidemos.

Se descartó commitear los PNG al sitio: son unos 170 kB cada uno, y a
treinta publicaciones por mes el repositorio engorda unos 25 MB mensuales
para siempre, además de que habría que esperar a que Cloudflare termine de
desplegar antes de poder publicar.

## Seguridad

La protección es un token en la cabecera, comparado en tiempo constante.
Alcanza para una bandeja de ideas. Si querés algo más serio, poné
**Cloudflare Access** adelante del Worker y atalo a tu correo: son dos
clics en el panel de Cloudflare y no hay que tocar el código.
