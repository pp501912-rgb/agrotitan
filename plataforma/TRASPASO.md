# Traspaso — plataforma de análisis multiespectral

> Instantánea de la rama `claude/nueva-app-idea-arquitectura-3vhu0d` del repositorio
> `pp501912-rgb/agrotitan`, al 5 de septiembre de 2026.
>
> **Si tenés acceso al repositorio, traelo con git en vez de usar este paquete:**
> `git fetch origin claude/nueva-app-idea-arquitectura-3vhu0d` — así conservás el historial,
> que tiene tres commits con el porqué de cada decisión.

---

## Leé esto primero

Este proyecto tiene una regla que manda sobre todas las demás, y está implementada, no escrita:

**Cada número que el sistema entrega tiene que poder defenderse frente a un agrónomo que
pregunte de dónde salió. Un modelo sin supuestos declarados es una opinión con decimales.**

En la práctica eso significa que **el motor prefiere negarse a estimar antes que entregar un
número que no puede respaldar**. Si encontrás un `raise DatoInsuficiente` o una restricción que
parece molesta, casi seguro está ahí a propósito. Antes de sacarla, leé el comentario de arriba:
todos dicen por qué existen.

---

## Estado real, sin adornos

| Parte | Líneas | Estado |
|---|---|---|
| `motor/dominio/` — el criterio agronómico | 1.402 | **Ejecutado y probado** |
| `motor/persistencia.py` — plan de escritura | 337 | **Ejecutado y probado** |
| `motor/informe.py`, `dominio/exportar.py` | 467 | **Ejecutado y probado** |
| `motor/reconstruir.py` — planificación | 156 | **Ejecutado y probado** |
| `base/*.sql` — 5 migraciones | 798 | **Ejecutado** contra PostgreSQL 16 real |
| `motor/raster/` | 801 | ⚠ **NUNCA EJECUTADO** |
| `motor/base/conexion.py` | 124 | ⚠ **NUNCA EJECUTADO** |
| `motor/exportar_shp.py` | 59 | ⚠ **NUNCA EJECUTADO** |
| `motor/canalizacion.py` — importa, pero su camino real nunca corrió | 328 | ⚠ **NUNCA EJECUTADO** |

**173 pruebas: 165 corriendo, 8 esperando entorno.**

### Por qué hay código sin ejecutar

El entorno donde se escribió esto **no tiene acceso a PyPI** (403 en `pypi.org`, directo y por
proxy) ni a repositorios apt. Fue imposible instalar numpy, rasterio, scikit-learn, scipy,
shapely, pyshp y psycopg. Todo lo que depende de esos paquetes está escrito con sus pruebas,
pero sin correr ni una vez.

**Nunca se procesó un ortomosaico real ni sintético.** Es el 21 % del código y donde está el
grueso de la probabilidad de bugs.

### Tu primer paso

```bash
conda env create -f entorno.yml
conda activate plataforma
make verificar
```

**Esperá que algo falle.** Para eso están las pruebas de `pruebas/raster/`. Cuando arregles algo
ahí, actualizá la tabla de arriba y la de `LEEME.md`: la honestidad sobre qué está verificado es
parte del producto, no del proceso.

---

## Arquitectura en una pantalla

```
motor/dominio/   El criterio agronómico. SIN numpy ni GDAL.
                 Se prueba en cualquier máquina, sin instalar nada.
motor/raster/    Aritmética masiva e I/O. CON numpy y rasterio.
                 Delgada a propósito: NO toma ninguna decisión agronómica.
motor/base/      PostgreSQL + PostGIS. SQL plano, sin ORM.
```

**Respetá esa frontera.** Si te encontrás escribiendo un umbral agronómico dentro de
`motor/raster/`, está mal ubicado. La separación es lo que permite probar el 78 % del motor sin
instalar nada, y lo que hace que el día que cambie la librería de rásters el criterio no se toque.

### La pieza que sostiene todo: `dominio/formula.py`

Los índices se declaran como texto en `catalogo/indices.json`:

```json
"NDRE": { "formula": "(nir - rededge) / (nir + rededge)", ... }
```

Se evalúan parseando con `ast` y una lista blanca de nodos — **nunca `eval`**, porque el catálogo
es un archivo editable y `eval` sobre un archivo editable es ejecutar código ajeno.

Como numpy sobrecarga los operadores, **el mismo evaluador corre sobre escalares y sobre arrays**.
Por eso probarlo con dos decimales verifica el camino que después procesa millones de píxeles.

### Agnosticismo de sensor

- La entrada es **siempre un ortomosaico de reflectancia**. El motor no hace fotogrametría.
- Las bandas se identifican por **rol** (`common_name` de STAC), nunca por número ni por marca.
- Una cámara nueva es **un YAML de 15 líneas** en `motor/perfiles/`, sin tocar código.
- Los roles que cada índice necesita **se deducen de la fórmula**, no se escriben a mano.

---

## Las reglas implementadas (no las rompas sin entenderlas)

1. **Sin calibración radiométrica no hay serie temporal.** Restricción `chk_comparable` en la
   base, validación en `Manifiesto`, y la vista `indice.serie_comparable` como única vía de
   consulta. Sin panel ni DLS son números digitales que cambian con la nubosidad.
2. **Sin franja de referencia no hay dosis de nitrógeno.** Se entrega un *mapa de variabilidad*,
   que se llama así y viene con la advertencia de por qué no es lo mismo.
3. **Una recomendación sin fuente no se construye.** Lo rechaza el constructor de
   `Recomendacion` y lo rechaza el `NOT NULL` de la base.
4. **Ninguna banda se sustituye por otra parecida.** El Mavic 3M no tiene azul: EVI y ARVI quedan
   deshabilitados **y reportados**, y se ofrece EVI2, que es la versión publicada para sensores
   sin azul. (MCARI sí se calcula: no usa azul. Es un error frecuente creer que sí.)
5. **No hay fórmula de biomasa precargada.** Hay calibración local con R² informado y advertencia
   cuando el ajuste es pobre. La literatura regional reporta R² ≈ 0,41 en pasturas de verano: ese
   aviso va a saltar seguido, y es la parte más útil del módulo.
6. **Una caída de vigor demasiado grande no se fertiliza: se va a mirar.** Por debajo del umbral
   de respuesta la diferencia rara vez es nitrógeno.
7. **Nunca se calculan hectáreas en grados.**
8. **Ningún cliente ve los datos de otro**, y sin declarar cuál sos no ves nada.
9. **Una corrida que falla deja rastro** en `auditoria.corrida` con `resultado = 'error'`.
10. **Si la base se pierde, las carpetas la reconstruyen** — idempotente por el sha256.

---

## Cuatro bugs que ya se encontraron (no los reintroduzcas)

1. **Comparar la suma de cuadrados contra cero exacto.** Con puntos de calibración degenerados el
   redondeo deja la suma en 3,7e-32, no en 0, y la pendiente salía absurda en silencio. La
   comparación tiene que ser **relativa a la escala de los datos**.
   → `motor/dominio/biomasa.py`, prueba en `pruebas/test_biomasa.py`
2. **Columnas `jsonb` `NOT NULL DEFAULT '{}'` con `NULL` explícito.** El `DEFAULT` no se aplica:
   el `INSERT` rebota. **Todo `INSERT` de corrida habría fallado.**
   → `motor/persistencia.py:_js`, prueba en `pruebas/test_persistencia.py`
3. **La banda térmica del Altum tratada como reflectancia.** Habría hecho rechazar vuelos válidos
   de ese equipo. Usá `perfil.ROLES_NO_ESPECTRALES`.
4. **RLS no se aplica a un superusuario ni al dueño de las tablas.** Las 23 políticas existían y
   no filtraban nada. Se cerró con `FORCE ROW LEVEL SECURITY` y el rol `plataforma_app`.
   → `base/004_rol_aplicacion.sql`

**Lección transferible:** los bugs 2 y 4 eran invisibles desde Python. Aparecieron solo al
ejecutar contra PostgreSQL de verdad. Si agregás lógica de base, agregala también a
`pruebas/verificar_persistencia.py`.

---

## Cómo verificar

```bash
python3 -m unittest discover -s pruebas -t . -v   # 165 pruebas, sin instalar nada
make verificar                                     # todo, necesita el entorno
make esquema  BASE_URL="postgresql://..."          # las 5 migraciones
make sql      BASE_URL="postgresql://..."          # 21 sentencias por PREPARE
make persistencia BASE_URL="postgresql://..."      # plan completo + aislamiento
```

⚠ **Conectate como `plataforma_app`, nunca como el dueño de la base.** El motor avisa por
pantalla si detecta un superusuario, pero no falla: hay tareas de administración legítimas.

---

## Qué falta, en orden de prioridad

1. **Correr la capa ráster por primera vez.** 801 líneas sin ejecutar. Hasta que `make verificar`
   pase entero, ese 21 % es una promesa.
2. **Ganadería de punta a punta.** Hay calibración de biomasa y presupuesto forrajero probados,
   pero no el pipeline: potreros → disponibilidad por potrero → orden de rotación → informe
   ganadero. Es medio rubro objetivo.
3. **El visor.** Hoy la salida son archivos. No hay nada que deje *ver* un mapa. La idea era
   MapLibre + PMTiles servido como archivo estático, costo cero.
4. **ISO-XML (ISOBUS).** Documentado en `docs/00-antecedentes.md`, sin implementar. Hoy se
   exporta SHP/GeoJSON, que es lo que consume la mayoría de los monitores.

**Fuera de alcance a propósito:** fotogrametría propia (OpenDroneMap es AGPL — usarlo como
proceso externo es seguro, embeberlo vuelve AGPL al producto) y deep learning (la PC de destino
tiene una RX 570: no es CUDA y está fuera de ROCm).

---

## Contexto que no está en el código

- **Destino:** Ryzen 3, **16 GB de RAM**, GPU AMD RX 570. De ahí salen las dos reglas duras:
  procesamiento **por ventanas de 512×512** y reflectancia en **uint16 escalado ×10.000**. Un
  ortomosaico de 100 ha a 5 cm son 32 GB en float32: no entra y no tiene que entrar.
- **Negocio:** uso interno mientras se prueba, multiusuario y vendible después. Por eso hay
  `organizacion_id` y RLS desde el día uno.
- **Rubros:** agricultura extensiva y ganadería, Cono Sur.
- **Competencia:** Auravant es argentino, freemium y tiene +120.000 usuarios. La diferenciación
  no puede ser el mapa: tiene que ser la trazabilidad del criterio agronómico.

---

## Convenciones

Todo en **español** —funciones, variables, tablas, columnas, comentarios—, cabecera en caja de `═`
diciendo qué hace el archivo y **por qué existe**, y comentarios que explican el porqué, nunca el
qué. Si un umbral vale 0,60, el comentario dice de dónde sale.

Sin frameworks. Sin ORM. Sin servicios pagos. Sin `eval`.
