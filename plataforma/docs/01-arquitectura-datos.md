# Arquitectura de datos

> El DDL ejecutable está en `base/001_esquema.sql`, `002_particiones.sql` y `003_rls.sql`.
> Este documento explica **por qué** está hecho así. El SQL manda; esto lo justifica.

---

## Principio rector: el píxel nunca entra a la base

PostGIS guarda **geometrías, metadatos, estadísticas y trazabilidad**. Los rásters viven en disco
como COG, y la base guarda un **puntero out-db** con la ruta y la huella (*footprint*).

La alternativa —cargar el ráster dentro de la base— está desaconsejada por la propia comunidad
PostGIS: 2 TB de rásters *in-db* son 2 TB de base, peor comprimidos que el archivo original. Con
*out-db*, la tabla pesa megabytes y los archivos quedan donde el sistema operativo sabe manejarlos.

**Ajuste obligatorio de PostgreSQL:** `max_files_per_process = 65536`. El valor por omisión (1000)
es demasiado bajo para out-db y produce errores difíciles de diagnosticar.

---

## Los ocho esquemas

| Esquema | Qué guarda |
|---|---|
| `nucleo` | organización, usuario, campo, lote, campaña |
| `sensor` | perfil de cámara, bandas por perfil, cámara física, calibración radiométrica |
| `vuelo` | vuelo, ortomosaico (puntero out-db), control de calidad |
| `indice` | capa por índice espectral, estadística zonal, vista de serie temporal |
| `manejo` | zona de manejo, prescripción, dosis por zona, recomendación |
| `campo` | verdad de terreno: muestras de suelo, cortes, plato de levante, franja de referencia de N |
| `ganaderia` | potrero, calibración de biomasa, disponibilidad de forraje, eventos de pastoreo |
| `auditoria` | corridas del motor: versión, parámetros, hash, duración, pico de memoria |

---

## Tres reglas del negocio codificadas como restricciones

La documentación no frena un `INSERT`. Estas tres sí:

**1. Sin calibración no hay comparabilidad.**

```sql
CONSTRAINT chk_comparable CHECK (comparable = false OR calibracion_id IS NOT NULL)
```

Un vuelo sin calibración radiométrica produce números digitales, no reflectancia. La base impide
marcarlo como comparable. Verificado: el `INSERT` falla con
`violates check constraint "chk_comparable"`.

**2. Una recomendación sin fuente es una opinión.**

`manejo.recomendacion.fuente` es `NOT NULL`. Verificado: el `INSERT` sin fuente falla.

**3. Una hectárea medida en grados no es una hectárea.**

`nucleo.lote.superficie_ha` la calcula un trigger que reproyecta a la UTM del campo
(`nucleo.campo.epsg_utm`: 32721 para 21S, 32720 para 20S, 32719 para 19S) antes de medir. Nunca se
escribe a mano.

A esas tres se suma la **vista `indice.serie_comparable`**, que es la única forma legítima de
consultar evolución temporal: filtra por `comparable = true` en vez de confiar en que nadie
grafique un vuelo incomparable por accidente.

---

## Particionado

Cuatro tablas crecen sin techo —una fila por vuelo, por capa de índice, por medición de
disponibilidad y por corrida— y se particionan **por rango de fecha, anual**:

`vuelo.vuelo` · `indice.capa` · `ganaderia.disponibilidad` · `auditoria.corrida`

Una campaña vieja se desprende con `DETACH PARTITION` y se archiva sin tocar el resto.

**Consecuencia que hay que conocer antes de escribir código:** PostgreSQL exige que la clave
primaria de una tabla particionada **incluya la clave de partición**. Por eso la PK de
`vuelo.vuelo` es `(id, fecha)`, y toda tabla hija arrastra `vuelo_fecha` para poder tener una clave
foránea compuesta:

```sql
FOREIGN KEY (vuelo_id, vuelo_fecha) REFERENCES vuelo.vuelo(id, fecha)
```

Es más verboso de escribir y más barato de consultar. Con miles de vuelos, vale la pena.

Cada tabla particionada tiene además una **partición `DEFAULT`**: red de contención para que nunca
se pierda un dato si falta el año. La vista `auditoria.particiones_default_ocupadas` avisa si algo
cayó ahí — si devuelve filas, hay que crear la partición que falta.

Para agregar un año: `SELECT auditoria.crear_particiones_anio(2028);`

---

## Aislamiento por organización (RLS), desde el día uno

Toda tabla de negocio lleva `organizacion_id` y tiene **Row Level Security activa**, con la política:

```sql
USING (organizacion_id = nucleo.organizacion_actual())
```

donde `nucleo.organizacion_actual()` lee `current_setting('app.organizacion', true)`. El motor
ejecuta, una vez por conexión:

```sql
SET app.organizacion = '<uuid de la organización>';
```

Si nadie lo setea, la función devuelve `NULL` y **no se ve nada**. Fallar cerrado es lo correcto:
preferimos una consulta vacía antes que mostrarle a un cliente los lotes de otro.

Hoy hay una sola organización y esto parece burocracia. No lo es: agregar RLS más tarde obliga a
reauditar la aplicación entera.

### El agujero que tenía esto, y cómo se cerró

La primera verificación comprobó que las 23 políticas **existen**. Eso no es lo mismo que
comprobar que se **aplican**, y la diferencia era grave:

**Row Level Security no se aplica a un superusuario, ni al dueño de las tablas.** El usuario que
crea la base es superusuario. Si el motor se conectaba con él —que era lo que decía la
configuración— las políticas no filtraban nada.

`base/004_rol_aplicacion.sql` lo cierra con dos medidas:

1. `FORCE ROW LEVEL SECURITY` en las 23 tablas, para que las políticas alcancen también al dueño.
2. El rol `plataforma_app`: `LOGIN`, sin `SUPERUSER`, sin `BYPASSRLS` y **sin `DELETE`** — un vuelo
   se marca `rechazado`, no se borra.

Contra un superusuario no hay defensa del lado de la base; la única defensa es no usarlo, así que
`motor/base/conexion.py` avisa por pantalla si detecta que está conectado con uno, y la vista
`auditoria.roles_que_saltean_rls` los lista.

**Verificado de verdad**, conectándose como `plataforma_app` con dos organizaciones cargadas: con
`app.organizacion` puesta en A se ve 1 vuelo y no 2; sin declararla no se ve ninguno (falla
cerrado); y el `DELETE` rebota por permisos.

Los **perfiles de cámara y sus bandas no llevan RLS**: son catálogo compartido. Que dos clientes
usen el mismo Mavic 3M no es información de nadie.

---

## Agnosticismo de sensor en el modelo

`sensor.perfil_camara` + `sensor.banda_perfil` son el espejo en base de los YAML de
`motor/perfiles/`. La columna que importa es `banda_perfil.rol`, restringida al vocabulario
`common_name` de la extensión EO de STAC:

```
coastal · blue · green · yellow · red · rededge · nir · nir08 · nir09 · pan · lwir
```

**El motor jamás mira el número de banda ni la marca.** Un índice se declara como fórmula sobre
roles (`(nir - rededge) / (nir + rededge)`), de modo que:

- agregar una cámara futura es agregar filas / un YAML, sin tocar código;
- el motor calcula automáticamente **qué índices son imposibles** con cada cámara y lo reporta.

Caso de prueba obligatorio: el DJI Mavic 3M no tiene banda azul → **EVI y ARVI deshabilitados y
reportados**, nunca calculados con un sustituto, con **EVI2** ofrecido como alternativa publicada
para sensores sin azul.

MCARI, en cambio, **sí se calcula** en un Mavic 3M: su fórmula usa borde rojo, rojo y verde. Es un
error frecuente suponer que necesita azul — el catálogo sigue la fórmula publicada, no la intuición,
y por eso los roles requeridos se deducen de la fórmula en vez de escribirse a mano.

---

## Disposición en disco

```
/datos/<organizacion>/<campo>/<lote>/<AAAA-MM-DD>_<vuelo_id>/
   ortomosaico.tif        COG uint16 ×10.000, bandas nombradas por rol STAC
   indices/
       ndvi.tif           COG uint16 escalado, con overviews
       ndre.tif
       ...
   zonas.gpkg
   prescripcion/*.shp
   informe.html
   manifiesto.json
```

La ruta es autoexplicativa y el `manifiesto.json` hace que **la carpeta sea reconstruible sin la
base**: organización, campo, lote, vuelo, fecha, cámara, calibración y versión del motor. Si la
base se pierde, un script la repuebla leyendo los manifiestos. Es el seguro de vida del proyecto.

### Por qué uint16 escalado y no float32

La reflectancia se guarda como entero de 16 bits multiplicado por 10.000, igual que Sentinel-2:

- **Mitad de disco y mitad de RAM** que float32.
- Cuatro decimales de precisión, que sobran para reflectancia.
- Un ortomosaico de 100 ha a 5 cm (40.000 × 40.000 px × 5 bandas) pasa de **32 GB a 16 GB**.
  Sigue sin entrar en 16 GB de RAM — por eso se procesa por ventanas — pero el archivo en disco
  y cada bloque leído pesan la mitad.

---

## Presupuesto de memoria: cómo alcanzan 16 GB

PC de destino: Ryzen 3, 16 GB de RAM, GPU AMD RX 570 (**sin CUDA: no acelera nada de esto**).

| Consumidor | Techo |
|---|---|
| PostgreSQL (`shared_buffers`) | **2 GB** — no más: la RAM la necesita el procesamiento |
| Motor: ventana de trabajo | ~200 MB (bloque 512×512 × 5 bandas, entrada y salida) |
| k-means: muestra de entrenamiento | 100.000 píxeles al azar (~4 MB) |
| Sistema operativo + QGIS | ~4 GB |
| **Objetivo de pico del motor** | **< 4 GB**, medido y guardado en `auditoria.corrida` |

Las dos técnicas que hacen posible el número:

1. **Lectura y escritura por ventanas** (`rasterio.windows`, bloques de 512×512). Nunca
   `src.read()` completo. No es una optimización: es la diferencia entre que funcione y que la PC
   se congele.
2. **k-means entrenado sobre muestra, aplicado por bloque.** Se ajusta el modelo con 100.000
   píxeles al azar y después se etiqueta el ráster entero bloque por bloque. Esto es *lo* que
   permite zonificar un lote de 500 ha con 16 GB.

---

## Verificación hecha

El DDL se ejecutó contra **PostgreSQL 16.13 real**, con estos resultados:

| Prueba | Resultado |
|---|---|
| `001` + `002` + `003` corren sin error | ✅ |
| Trigger de superficie calcula en UTM | ✅ |
| `comparable = true` sin calibración | ✅ **rechazado** por `chk_comparable` |
| `comparable = false` | ✅ aceptado |
| Ruteo de partición (fecha 2026) | ✅ cae en `vuelo.p_vuelo_2026`, DEFAULT vacía |
| Columna generada `ajuste_pobre` con R² = 0,41 | ✅ devuelve `true` |
| Recomendación sin fuente | ✅ **rechazada** por `NOT NULL` |
| Tablas con RLS activa | ✅ 23 |
| Un plan de escritura completo (15 operaciones) | ✅ entra sin error |
| Las filas caen en la partición del año | ✅ `p_vuelo_2026`, DEFAULT vacía |
| p5 y p95 se guardan | ✅ |
| **Aislamiento entre organizaciones, como `plataforma_app`** | ✅ A no ve nada de B |
| Sin declarar organización no se ve nada | ✅ falla cerrado |

**Limitación honesta de esta verificación:** en el contenedor de desarrollo no se pudo instalar
PostGIS (sin acceso a repositorios apt ni daemon Docker), así que las columnas `geometry(...)` se
sustituyeron por `text` y los índices GIST por btree para poder ejecutar el resto. **Todo lo
estructural quedó verificado; falta correr el DDL tal cual, con PostGIS instalado, en la PC de
destino** — es el primer paso de `02-instalacion.md`.
