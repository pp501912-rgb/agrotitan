# Imágenes del sitio

El sitio **funciona sin ninguna foto**. Cada lugar tiene un degradado de
color propio que se ve bien y no pesa nada. Las fotos lo mejoran, no lo
habilitan: podés publicar hoy y agregarlas después.

---

## Qué foto va en cada lugar

| Archivo a crear | Dónde se ve | Medida mínima | Qué buscar |
|---|---|---|---|
| `hero.jpg` | Fondo de la portada | 1920 × 1080 | Aérea de campo al amanecer o atardecer. Líneas de cultivo visibles. Cielo con algo de color. **Que el lado izquierdo sea oscuro o uniforme**: ahí va el texto |
| `proyecto-nogal.jpg` | Tarjeta Nogal | 800 × 600 | Plantación de nogales en línea, vista baja o aérea |
| `proyecto-avellano.jpg` | Tarjeta Avellano | 800 × 600 | Avellanos jóvenes, hilera de plantación |
| `proyecto-cerezo.jpg` | Tarjeta Cerezo | 800 × 600 | Cerezos con fruta, o en floración |
| `proyecto-arandano.jpg` | Tarjeta Arándano | 800 × 600 | Arándanos en macetas o camellones, con la estructura visible |
| `proyecto-avicola.jpg` | Tarjeta Avícola | 800 × 600 | Galpón cerrado por fuera, o interior con iluminación controlada |
| `og.jpg` | Vista previa al compartir por WhatsApp | 1200 × 630 | Puede ser la misma del hero, recortada |

---

## Dónde bajarlas gratis

Las tres permiten uso comercial sin pagar ni pedir permiso:

- **Pexels** — pexels.com
- **Unsplash** — unsplash.com
- **Pixabay** — pixabay.com

Buscá en inglés, que hay muchas más: `walnut orchard`, `hazelnut plantation`,
`cherry orchard`, `blueberry farm`, `poultry house interior`,
`aerial farmland sunrise`.

> **Ojo con el avícola.** Es el más difícil de encontrar bien. Si no
> aparece nada digno, dejá el degradado: se ve mejor que una foto mala.

---

## Antes de subirlas: achicalas

Una foto de cámara pesa 5 MB. Eso son 30 segundos de espera con señal
débil en el campo — justo tu público.

**Objetivo: menos de 300 KB cada una.**

Sin instalar nada, en [squoosh.app](https://squoosh.app):

1. Arrastrás la foto.
2. A la derecha elegís **MozJPEG**, calidad **72**.
3. Si sigue pesada, bajá el ancho a 1600 (hero) u 800 (tarjetas).
4. Descargar.

---

## Cómo activarlas

Las fotos **no se activan solas**. Hay que descomentar dos líneas.

### Portada

En `css/secciones.css`, buscá `.hero__fondo` y descomentá:

```css
background-image: url("../img/hero.jpg");
background-size: cover;
background-position: center;
```

### Tarjetas de proyecto

En `css/secciones.css`, buscá `.proyecto__imagen--nogal` y reemplazá el
degradado por:

```css
.proyecto__imagen--nogal {
  background-image: url("../img/proyecto-nogal.jpg");
  background-size: cover;
  background-position: center;
}
```

Lo mismo con los otros cuatro rubros.

---

## Cuando tengas fotos propias

**Reemplazalas.** Las de stock se notan y las de tu campo valen más que
cualquier foto perfecta de banco de imágenes. Un galpón tuyo, una
plantación que evaluaste, una foto de campo tomada con el celular: eso
es prueba de que trabajaste ahí.

Misma medida, mismo nombre de archivo, y listo.
