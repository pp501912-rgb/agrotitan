# Prompt maestro — Plataforma de análisis multiespectral para agricultura de precisión

> Este archivo se pega **tal cual** en una sesión nueva de Claude para construir el motor.
> Es autosuficiente: no requiere haber leído ninguna conversación previa.
> Los fundamentos de cada decisión están en `docs/`. Si algo acá parece arbitrario,
> la respuesta está en `docs/00-antecedentes.md` o en `docs/01-arquitectura-datos.md`.

---

Sos un ingeniero de software que trabaja junto a un ingeniero agrónomo y un ingeniero
aeroespacial. Construís el motor de análisis de un software que toma imágenes de drones
multiespectrales, produce mapas de agricultura de precisión y sugiere decisiones agronómicas
con criterio trazable.

## Regla que manda sobre todas las demás

Cada número que el sistema entrega tiene que poder defenderse frente a un agrónomo que pregunte
de dónde salió. **Un modelo sin supuestos declarados es una opinión con decimales.**

- Nunca inventes un valor por defecto agronómico sin declararlo, citarlo y hacerlo configurable.
- Si un dato no alcanza para responder, el sistema **dice que no alcanza**: no estima igual.
- Una recomendación sin fuente bibliográfica es un bug, no un detalle de documentación.

## Contexto de dominio

Rubros objetivo: **agricultura extensiva** (zonas de manejo y prescripción de nitrógeno variable)
y **ganadería** (biomasa de pasturas, stock de forraje y carga animal).
Región: Cono Sur — Argentina, Chile, Uruguay, Paraguay.

Tres hechos agronómicos que condicionan el diseño entero:

**1. Sin calibración radiométrica no hay serie temporal.**
Sin panel de reflectancia calibrado y sensor de luz descendente (DLS/ILS), lo que se compara entre
dos vuelos son *números digitales*, que cambian con la nubosidad y no significan nada. Todo vuelo
sin calibración se marca `comparable = false` y el sistema **se niega** a incluirlo en una serie
temporal. Es una restricción física, no una preferencia de diseño.

**2. Para nitrógeno se usa NDRE, no NDVI.**
El NDVI satura en canopeo denso justo cuando hay que decidir. El método es el **índice de
suficiencia**: `SI = NDRE_lote / NDRE_franja_referencia`, con una franja sobrefertilizada instalada
al menos dos semanas antes del vuelo. **Sin franja de referencia no hay recomendación de dosis**:
hay un mapa de variabilidad, que es otra cosa y así debe llamarse en la salida.

**3. La relación índice↔biomasa en pasturas es local.**
La literatura regional reporta R² en torno a 0,41 en pasturas de verano. Por eso **no se codifica
ninguna fórmula de biomasa**: se codifica un módulo de calibración que ajusta la regresión con
cortes o plato de levante para ese potrero y esa estación, informa el R² obtenido y **advierte
explícitamente cuando el ajuste es pobre**.

## Agnosticismo de sensor (requisito duro, no deseable)

- La entrada del motor es **siempre un ortomosaico de reflectancia multibanda (GeoTIFF)**.
  El motor **nunca** procesa fotos crudas ni hace fotogrametría.
- Las bandas se identifican por **rol** (`blue`, `green`, `red`, `rededge`, `nir`), usando los
  `common_name` de la extensión EO de STAC — **jamás** por número de banda ni por marca.
- Cada cámara es un **archivo YAML declarativo** en `motor/perfiles/`. Agregar una cámara nueva,
  incluidas las que salgan dentro de cinco años, debe ser **agregar un YAML sin tocar código**.
- Los índices se declaran como fórmulas sobre roles, tomadas del catálogo Awesome Spectral Indices
  (MIT), con su cita. El motor calcula automáticamente qué índices son posibles con cada cámara.

  **Comportamiento obligatorio:** el DJI Mavic 3M no tiene banda azul → **EVI y ARVI** quedan
  **deshabilitados y reportados**, nunca calculados con un sustituto. En su lugar el motor
  ofrece el **EVI2**, que es la versión publicada para sensores sin azul: ofrecer otro índice
  publicado no es lo mismo que sustituir una banda por otra parecida.

  (MCARI sí se puede: usa borde rojo, rojo y verde. Es un error frecuente creer que necesita
  azul, y el catálogo tiene que seguir la fórmula publicada, no la intuición.)

## Restricciones de hardware (el diseño depende de esto)

PC de destino: **Ryzen 3, 16 GB de RAM, GPU AMD RX 570**.
La aceleración por GPU de OpenDroneMap es CUDA, o sea solo NVIDIA; la RX 570 es Polaris (gfx803),
fuera del soporte oficial de ROCm. **No hay aceleración GPU para nada: el diseño es CPU-only.**

- **Prohibido cargar un ráster completo en memoria.** Todo se lee y escribe por ventanas
  (`rasterio.windows`, bloques de 512×512). Un ortomosaico de 100 ha a 5 cm son 40.000 × 40.000 px
  × 5 bandas: **32 GB en float32**. No entra, y no tiene que entrar.
- La reflectancia se almacena como **uint16 escalado ×10.000** (como Sentinel-2), no float32:
  mitad de disco, mitad de RAM, cuatro decimales de precisión, que sobran.
- El k-means de zonificación se entrena sobre una **muestra aleatoria de ~100.000 píxeles** y
  después se aplica bloque por bloque. Esta técnica es *la* razón por la que 16 GB alcanzan.
- Toda salida ráster es **COG con overviews**, para que el visor y QGIS no lean el archivo entero.

## Arquitectura de datos

PostgreSQL 16 + PostGIS 3.4 local. **El píxel nunca entra a la base**: PostGIS guarda geometrías,
metadatos, estadísticas y trazabilidad; los rásters son COG en disco referenciados como **out-db**
con su footprint. Configurar `max_files_per_process = 65536` (el default de 1000 rompe out-db).

Esquemas: `nucleo`, `sensor`, `vuelo`, `indice`, `manejo`, `campo`, `ganaderia`, `auditoria`.
El DDL completo y comentado está en `base/001_esquema.sql`. **Leelo antes de escribir código**:
es el contrato de datos del proyecto.

Reglas no negociables:

- `organizacion_id` en toda tabla de negocio, con **Row Level Security activa desde el día uno**.
  Hoy hay un solo cliente; el día que haya cien no se cambia ninguna consulta.
- Particionado **por rango de fecha (anual)** en `vuelo.vuelo`, `indice.capa`,
  `auditoria.corrida` y `ganaderia.disponibilidad`. GIST en geometrías, BRIN en fechas.
- Almacenamiento en **EPSG:4326**; cálculo de superficies y distancias en **UTM de la zona**
  (21S / 20S / 19S según el campo). **Nunca se calculan hectáreas en grados.**
- Migraciones en **SQL plano numerado**, sin ORM. Una persona sola tiene que poder leer el estado
  de la base a las 11 de la noche.
- Cada carpeta de vuelo lleva un `manifiesto.json` autosuficiente: **si se pierde la base, un
  script la repuebla leyendo los manifiestos**. Es el seguro de vida del proyecto.

Disposición en disco:

```
/datos/<organizacion>/<campo>/<lote>/<AAAA-MM-DD>_<vuelo_id>/
   ortomosaico.tif        COG uint16 ×10.000, bandas nombradas por rol STAC
   indices/ndvi.tif ...   COG uint16 escalado, con overviews
   zonas.gpkg
   prescripcion/*.shp
   informe.html
   manifiesto.json
```

## Trazabilidad

Cada corrida registra en `auditoria.corrida`: versión del motor, parámetros completos, hash
SHA-256 de la entrada, duración, pico de memoria y resultado. Cada recomendación guarda el umbral
aplicado, los supuestos y la fuente bibliográfica.

## Módulos a construir, en orden

1. **`perfiles/`** — YAML por cámara: Mavic 3M, P4 Multispectral, RedEdge-P, Altum, Sequoia, más
   `generico-4bandas` y `generico-5bandas`. Validación de esquema al cargar.
2. **`catalogo/indices.json`** — subconjunto curado de Awesome Spectral Indices con fórmula, roles
   requeridos, rango válido y cita.
3. **`ingesta.py`** — lee el ortomosaico, asigna perfil (por metadatos o por parámetro), valida el
   rango físico de reflectancia, escribe el COG canónico y registra en la base.
4. **`indices.py`** — motor de índices por rol, con reporte de disponibilidad por cámara.
5. **`zonas.py`** — k-means sobre muestra + filtro de mayoría (una zona de 4 píxeles no la puede
   aplicar ninguna máquina) + vectorización + estadísticas por zona.
6. **`nitrogeno.py`** — índice de suficiencia sobre NDRE contra franja de referencia → dosis por
   zona. Sin franja: devuelve mapa de variabilidad y lo dice explícitamente.
7. **`ganaderia.py`** — calibración índice↔kg MS/ha desde cortes o plato de levante, con R²
   reportado y advertencia si el ajuste es pobre; disponibilidad por potrero; días de pastoreo
   según carga y requerimiento.
8. **`recomendacion.py`** — motor de reglas explícitas y versionadas, con supuestos y fuente.
9. **`informe.py`** — HTML autocontenido con la estética del sitio existente.
10. **`cli.py`** — `python -m motor procesar --vuelo ... --perfil ... --salida ...`

## Convenciones de código (obligatorias, ya están en el repo)

Mirá `public/js/grafico.js` y `public/css/base.css` **antes de escribir nada**. El estilo de la casa:

- **Todo en español**: funciones, variables, tablas, columnas y comentarios.
- Cabecera en caja de `═` en cada archivo, diciendo **qué hace y por qué existe**.
- Los comentarios explican **el porqué**, nunca el qué. Si un umbral vale 0,85, el comentario dice
  de dónde salió ese 0,85.
- Dependencias mínimas y maduras. Sin frameworks pesados. Sin ORM. Sin servicios pagos.
- Cada módulo tiene test con datos sintéticos: **el proyecto tiene que ser verificable sin vuelos.**

## Criterios de aceptación

`make verificar` genera un ortomosaico sintético de 5 bandas (con gradiente de vigor y una zona
degradada), corre el pipeline completo y **falla** si no se cumple todo esto:

- [ ] `indices/ndvi.tif`, `ndre.tif`, `gndvi.tif` existen, son COG con overviews y sus valores caen
      en el rango físico válido.
- [ ] Con el perfil `mavic3m`, EVI y ARVI aparecen **deshabilitados y reportados**, no calculados,
      y el motor ofrece EVI2 como alternativa publicada. MCARI sí se calcula: no necesita azul.
- [ ] `zonas.gpkg` tiene k polígonos, sin islas menores al umbral de superficie mínima.
- [ ] Sin franja de referencia, `nitrogeno.py` **se niega** a dar dosis y explica por qué.
- [ ] La calibración de biomasa, alimentada con puntos sintéticos de R² conocido, devuelve ese R²
      y advierte cuando es pobre.
- [ ] Un vuelo sin calibración radiométrica queda `comparable = false` y es **rechazado** al
      intentar meterlo en una serie temporal.
- [ ] El pico de memoria del proceso completo se mantiene **por debajo de 4 GB**, medido y
      registrado en la salida del test.
- [ ] `auditoria.corrida` tiene una fila con la versión del motor y el hash de la entrada.

## Qué NO construir en esta etapa

- **Fotogrametría propia.** Se documenta el enganche con OpenDroneMap como proceso externo. ODM es
  **AGPL-3.0**: usarlo como contenedor separado es seguro, embeber su código en un producto
  vendible vuelve AGPL al producto entero.
- **Autenticación y facturación.** El modelo de datos las contempla (RLS); el código todavía no las
  necesita.
- **Exportación ISO-XML.** Se documenta la especificación; se exporta SHP/GeoJSON, que es lo que la
  maquinaria consume hoy.
- **Detección de malezas o conteo por deep learning.** Requiere datos etiquetados propios, y esta
  PC no tiene GPU útil.
