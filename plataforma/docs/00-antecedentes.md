# Antecedentes — qué ya existe, qué se copia y bajo qué licencia

> Relevamiento hecho en septiembre de 2026. La conclusión corta: **la cadena entera existe
> en open source y es copiable legalmente**. Lo que no existe hecho es la capa de criterio
> agronómico trazable, que es exactamente donde está el valor del producto.

---

## La cadena canónica de un vuelo multiespectral

**1. Vuelo y captura.** Planificación de misión con solape 75/75, altura fija, cámara nadir.
Libre: QGroundControl / Mission Planner (ArduPilot, PX4). En DJI la misión la hace el propio
controlador (DJI Pilot 2).

**2. Calibración radiométrica.** El paso que separa un mapa lindo de un dato. Sin esto se obtienen
*números digitales*, no reflectancia, y **no se pueden comparar dos vuelos de fechas distintas**.
Se resuelve con panel de reflectancia calibrado + sensor de luz descendente (DLS/ILS).
Un trabajo de 2024 sobre exposición y calibración encontró que la calibración con **panel
fotografiado a altura de vuelo** da mejor exactitud geométrica y radiométrica que confiar solo en
el ILS — dato que se convirtió en regla del protocolo de vuelo (ver `03-protocolo-de-vuelo.md`).

**3. Fotogrametría / ortomosaico.** OpenDroneMap procesa multiespectral de forma nativa: todas las
bandas juntas en una carpeta, alineación de bandas incluida, y `--radiometric-calibration
camera` o `camera+sun` para obtener reflectancia. La comunidad publicó guía específica para el
DJI Mavic 3M. Alternativas pagas: Pix4Dfields, Agisoft Metashape, DJI Terra.

**4. Índices espectrales.** No se inventan: existe el catálogo estandarizado *Awesome Spectral
Indices* (232 índices con fórmula validada y cita, publicado en *Nature Scientific Data*) con su
librería Python `spyndex`.

**5. Visualización.** Stack cloud-native: COG (Cloud Optimized GeoTIFF) + TiTiler / rio-tiler
sirviendo tiles dinámicos sin pre-cachear, STAC para catalogar. Front con MapLibre o Leaflet.
Para costo cero: PMTiles servido como archivo estático.

**6. Salida agronómica.** Zonificación y mapa de prescripción exportado en SHP/GeoJSON y en
ISO-XML (ISOBUS, ISO 11783-10) para que entre en la maquinaria.

---

## Tabla de licencias — qué se puede copiar y qué no

| Pieza | Fuente | Licencia | Cómo la usamos |
|---|---|---|---|
| Fotogrametría + calibración | [OpenDroneMap/ODM](https://github.com/OpenDroneMap/ODM), ver [`opendm/multispectral.py`](https://github.com/OpenDroneMap/ODM/blob/master/opendm/multispectral.py) | **AGPL-3.0** | **Solo como proceso o contenedor externo.** Invocarlo por CLI no contagia la licencia; copiar su código a un producto propietario sí. Es la restricción legal más importante del proyecto. |
| Calibración con panel y DLS | [`micasense/imageprocessing`](https://github.com/micasense/imageprocessing) | BSD-3 | Copiable. Clase `Panel` (detecta el QR del panel calibrado), radiancia→reflectancia, corrección de viñeteado. |
| Pipeline batch derivado | [`moghi005/Micasense_preprocessing`](https://github.com/moghi005/Micasense_preprocessing) | Abierta | Referencia de cómo encadenar la calibración en lote. |
| Catálogo de índices | [Awesome Spectral Indices](https://github.com/awesome-spectral-indices/awesome-spectral-indices) · [`spyndex`](https://github.com/awesome-spectral-indices/spyndex) · [paper](https://www.nature.com/articles/s41597-023-02096-0) | MIT | **Copiamos el catálogo JSON con sus citas.** Nadie reimplementa un NDRE. |
| Nombres de banda | [STAC EO extension](https://github.com/stac-extensions/eo) | Apache-2.0 | `common_name` (`blue`, `green`, `red`, `rededge`, `nir`) es **la clave del agnosticismo de sensor**. |
| Lectura de rásters | [`rasterio`](https://github.com/rasterio/rasterio) · [`rio-tiler`](https://github.com/cogeotiff/rio-tiler) | BSD | Dependencia directa. |
| Servidor de tiles (a futuro) | [TiTiler](https://developmentseed.org/titiler/) | MIT | Cuando haya servidor. Hoy no hace falta. |
| Interoperabilidad con maquinaria | [AgGateway ADAPT](https://github.com/ADAPT) + ISOv4Plugin (ISO 11783-10) | Open source, **C#/.NET** | **Como especificación de referencia**, no como dependencia: es .NET. El MVP exporta SHP/GeoJSON, que es lo que consume la enorme mayoría de los monitores. |
| Identidad global de lotes | [AgStack Asset Registry](https://github.com/agstack) (Linux Foundation) | Apache-2.0 | Opcional a futuro: GeoIDs determinísticos por lote, útiles para trazabilidad de cadena. |
| Índice del rubro | [`awesome-agriculture`](https://github.com/brycejohnston/awesome-agriculture) | — | Punto de partida para no reinventar nada más. |
| Registro de campos | [farmOS](https://farmos.org/) | GPL | Referencia de modelo de datos de gestión, no dependencia. |

### La trampa del AGPL, explicada

OpenDroneMap es AGPL-3.0. Eso significa que si su código termina **dentro** del producto, el
producto entero queda obligado a publicar su fuente, incluso ofreciéndolo como servicio en red.
Usarlo como **binario separado** (contenedor Docker, invocación por línea de comandos) no dispara
esa obligación. Por eso el motor arranca desde el ortomosaico ya generado y ODM queda del otro lado
de una frontera de proceso. **Esta decisión de arquitectura es legal antes que técnica.**

---

## Competencia

| Plataforma | Origen | Notas |
|---|---|---|
| **[Auravant](https://www.auravant.com/)** | **Argentina** | El competidor real en el Cono Sur. Freemium, +120.000 usuarios, presencia en Argentina, Brasil y España. Ya cruza satélite y drone. |
| Solvi | Suecia | Muy fuerte en conteo de plantas y análisis de ensayos. |
| Pix4Dfields | Suiza | El único que procesa **en el campo, en la notebook**, sin nube. |
| DroneDeploy | EE.UU. | El más grande; enfoque general, no específicamente agronómico. |
| Sentera | EE.UU. | Integra hardware propio y analítica. |
| Agrobit | Argentina | Gestión agrícola con prescripción variable. |

**Lectura estratégica:** el mapa bonito es una mercancía; lo tiene todo el mundo. La diferenciación
posible es la **trazabilidad del criterio agronómico** (cada número con su supuesto y su fuente) y
el puente con la **evaluación económica del proyecto**, que ninguna de estas plataformas hace.

---

## Hardware de referencia

| | DJI Mavic 3M | MicaSense RedEdge-P |
|---|---|---|
| Precio | ~US$ 4.959, aeronave integrada | ~US$ 7.995 + drone (M300/M350) |
| Bandas | 4: verde, rojo, borde rojo, NIR + RGB 20 MP | 5 estrechas + pancromática |
| **Banda azul** | **No tiene** → sin EVI ni MCARI | Sí |
| Resolución | — | 1,6 MP por banda; 2 cm a 60 m |
| Panel + DLS | Limitado | Panel calibrado + DLS 2 |

La ausencia de banda azul en el Mavic 3M no es un detalle: deshabilita índices reales. El motor
tiene que decirlo, no disimularlo. Es el caso de prueba obligatorio del agnosticismo de sensor.

---

## Marco regulatorio (Argentina, 2026)

Las **Resoluciones ANAC 311, 312 y 313/2026** actualizaron las RAAC (Partes 91, 100 y 137).

- **Categoría abierta:** operación dentro del alcance visual del piloto (VLOS), altura máxima
  **122 m**, equipos de hasta **25 kg**. No exige licencia de piloto: alcanza con el registro
  digital del dron ante ANAC y la acreditación gratuita de conocimientos básicos.
- **Drones de más de 25 kg o de uso específico:** registro obligatorio de la aeronave, y el piloto
  debe contar con licencia aeronáutica (RAAC Parte 61, Subparte L) y Certificación Médica
  Aeronáutica Clase 3 (Parte 67).

Un dron de **relevamiento** multiespectral entra cómodo en categoría abierta. Uno de **aplicación**
(pulverización, típicamente >25 kg) no. Esto se documenta; no se codifica.

---

## Qué NO encontramos hecho

Y por eso hay proyecto:

1. Un motor de índices genuinamente **agnóstico de sensor** que declare qué no puede calcular.
2. Un módulo de **calibración local de biomasa** que reporte su R² y **advierta cuando es pobre**,
   en lugar de entregar un kg MS/ha sin intervalo de confianza.
3. **Trazabilidad de la recomendación**: qué se midió, qué umbral se aplicó, qué se supuso y qué
   fuente lo respalda, guardado en base y reproducible dos campañas después.
