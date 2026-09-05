# Instalación en la PC

> PC de destino: **Ryzen 3, 16 GB de RAM, GPU AMD RX 570**.
> Todo lo que sigue es gratis. No hay ningún servicio pago en la cadena.

---

## Antes que nada: qué hace y qué no hace tu GPU

La **RX 570 no acelera nada de este pipeline.** La aceleración por GPU de OpenDroneMap es CUDA, o
sea exclusivamente NVIDIA; y la RX 570 es arquitectura Polaris (gfx803), fuera del soporte oficial
de ROCm, así que tampoco servirá para deep learning más adelante.

**Consecuencia de diseño: todo el procesamiento es CPU-only.** La placa sirve para lo que sirve de
verdad acá: mover QGIS y el visor con fluidez. No es un problema — el motor está diseñado para eso.

La **fotogrametría propia queda fuera de esta PC**. Correr OpenDroneMap sobre 500+ fotos con un
Ryzen 3 y 16 GB son horas de proceso con riesgo de swap. El ortomosaico se genera con DJI Terra,
Pix4D, o con ODM en otra máquina; el motor arranca desde ahí. El punto de enganche queda
documentado y probado para el día que haya un equipo con NVIDIA.

---

## 1. PostgreSQL 16 + PostGIS 3.4

Dos caminos. **Elegí uno solo.**

### Camino A — Docker (recomendado, menos cosas que romper)

Requiere Docker Desktop.

```bash
cd plataforma
docker compose up -d
docker compose ps          # esperar a que diga (healthy)
```

El `docker-compose.yml` ya deja aplicados los ajustes que este proyecto necesita
(`max_files_per_process=65536`, `shared_buffers=2GB`).

### Camino B — Instalación nativa

1. Instalar PostgreSQL 16 desde el instalador oficial.
2. Instalar PostGIS 3.4 con el Stack Builder (Windows) o el paquete
   `postgresql-16-postgis-3` (Linux).
3. Editar `postgresql.conf`:

```ini
# El default (1000) es demasiado bajo para rásters out-db y produce
# errores difíciles de diagnosticar.
max_files_per_process = 65536

# 2 GB y no más: en una PC de 16 GB la RAM la necesita el procesamiento.
shared_buffers = 2GB
work_mem = 64MB
maintenance_work_mem = 512MB
```

4. Reiniciar el servicio.

### Crear el esquema (los dos caminos)

```bash
make esquema BASE_URL="postgresql://plataforma:plataforma@localhost:5432/plataforma"
```

Corre las cinco migraciones en orden: esquema, particiones, RLS, rol de aplicación y claves
naturales.

### ⚠ Con qué usuario se conecta el motor

**El usuario que crea la base es superusuario, y Row Level Security NO SE APLICA a un
superusuario.** Si el motor se conectara con él, las políticas de aislamiento entre clientes
estarían perfectas y no filtrarían nada: un cliente vería los lotes de otro, sin ningún síntoma
hasta el día que alguien lo note.

`base/004_rol_aplicacion.sql` crea el rol `plataforma_app`, sin `SUPERUSER`, sin `BYPASSRLS` y sin
permiso de borrar. **Ese es el usuario del motor.** Cambiale la contraseña antes de usarlo en serio:

```bash
psql "$BASE_URL" -c "ALTER ROLE plataforma_app PASSWORD 'una contraseña de verdad'"
export PLATAFORMA_BASE_URL="postgresql://plataforma_app:esa_contraseña@localhost:5432/plataforma"
```

El motor avisa por pantalla si detecta que está conectado como superusuario. No falla —hay tareas
de administración legítimas— pero no lo deja pasar en silencio.

**Este es el primer paso obligatorio** y además es la verificación pendiente: el DDL fue probado
contra PostgreSQL 16 real, pero con PostGIS sustituido (no se pudo instalar en el contenedor de
desarrollo). Correrlo acá, con PostGIS de verdad, cierra esa verificación.

Comprobación rápida de que quedó bien:

```sql
SELECT postgis_full_version();
SELECT count(*) FROM pg_class WHERE relrowsecurity;     -- debe dar 23
SELECT * FROM auditoria.particiones_default_ocupadas;   -- todo en 0
SELECT * FROM auditoria.roles_que_saltean_rls;          -- NO debe devolver nada
```

Y la comprobación que de verdad importa, que ejecuta un plan de escritura completo y prueba el
aislamiento conectándose como `plataforma_app`:

```bash
make persistencia BASE_URL="$PLATAFORMA_BASE_URL"
```

---

## 2. Python con Miniforge

Miniforge trae conda-forge por omisión, que es la única forma sensata de instalar GDAL sin pelearse
—sobre todo en Windows—.

```bash
conda env create -f entorno.yml
conda activate plataforma
```

Comprobación:

```bash
python -c "import rasterio, sklearn, psycopg; print(rasterio.__gdal_version__)"
gdalinfo --version
```

---

## 3. QGIS LTR

Es el control visual de todo lo que produzca el motor, y se conecta directo a la base PostGIS
(Capa → Añadir capa → PostGIS). Sin esto, se trabaja a ciegas.

Descargar la versión **LTR** (soporte a largo plazo), no la última.

---

## 4. Opcionales

| Herramienta | Para qué | Cuándo |
|---|---|---|
| Docker Desktop | Correr OpenDroneMap como contenedor | Solo cuando haya una PC con NVIDIA |
| `pmtiles` / `rio-mbtiles` | Publicar el visor como archivo estático, sin servidor | Cuando exista el visor |
| TiTiler | Servidor de tiles dinámico | Cuando el producto pase a SaaS |

---

## 5. Estructura de carpetas de datos

```bash
mkdir -p datos
```

El motor escribe dentro con esta convención, que **no** es negociable porque de ella depende que la
base se pueda reconstruir:

```
datos/<organizacion>/<campo>/<lote>/<AAAA-MM-DD>_<vuelo_id>/
```

Si usás Docker, `./datos` se monta dentro del contenedor **en la misma ruta**, para que los
punteros out-db a los COG resuelvan igual desde adentro y desde afuera. Si movés esa carpeta,
cambiá también el montaje del `docker-compose.yml`.

---

## Resumen de lo que queda instalado

| Componente | Versión | Rol |
|---|---|---|
| PostgreSQL | 16 | base de datos |
| PostGIS | 3.4 | geometrías, punteros out-db a los COG |
| Python | 3.11 (Miniforge) | motor |
| GDAL | 3.9 | lectura y escritura de rásters |
| rasterio, numpy, scikit-learn, scipy, shapely, pyproj, fiona | ver `entorno.yml` | procesamiento |
| psycopg 3 | 3.1 | acceso a la base, sin ORM |
| QGIS | LTR | control visual |

Costo total de licencias: **cero**. Costo de infraestructura mientras sea de uso interno:
**cero** — corre todo en esta PC.
