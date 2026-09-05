# Plataforma de análisis multiespectral para agricultura de precisión

Software que toma imágenes de **drones multiespectrales**, produce mapas de agricultura de
precisión y **sugiere decisiones** para **agricultura extensiva y ganadería**.

> Este directorio es independiente del sitio institucional que vive en `../public/`.
> Está pensado para poder extraerse a su propio repositorio sin dolor.

---

## Estado, sin adornos

| Parte | Estado |
|---|---|
| `motor/dominio/` — el criterio agronómico | **Escrito y verificado.** 118 pruebas corriendo |
| `base/*.sql` — el esquema | **Verificado** contra PostgreSQL 16 real (PostGIS sustituido) |
| `motor/base/repositorio.py` — el SQL del motor | **Verificado**: 17/17 sentencias pasan `PREPARE` |
| `motor/informe.py`, `motor/dominio/exportar.py` | **Escritos y verificados** |
| `motor/cli.py` | **Escrito y ejecutado** para los comandos de dominio |
| `motor/raster/`, `motor/canalizacion.py` | **Escritos, NUNCA EJECUTADOS** |
| `motor/base/conexion.py`, `motor/exportar_shp.py` | **Escritos, NUNCA EJECUTADOS** |

**Por qué la mitad no se ejecutó:** el entorno donde se escribió esto no tiene acceso a PyPI
(403 en `pypi.org`, tanto directo como por proxy) ni a repositorios apt, así que fue imposible
instalar numpy, rasterio, scikit-learn, scipy, shapely, pyshp y psycopg. Todo lo que depende de
esos paquetes está escrito con sus pruebas, pero **sin correr ni una vez**. Es el 30% del código
y donde está el 70% de la probabilidad de bugs.

**Primer paso en la PC de destino** — y hay que esperar que algo falle, para eso están las pruebas:

```bash
conda env create -f entorno.yml
conda activate plataforma
make verificar
```

---

## Empezar

```bash
# Estos comandos funcionan en cualquier máquina con Python. Sin instalar nada.
python3 -m unittest discover -s pruebas -t . -v      # 118 pruebas del dominio
python3 -m motor listar-indices --perfil mavic3m
python3 -m motor verificar-entorno
python3 -m motor forraje --kg-ms-ha 2800 --superficie-ha 25 --cabezas 120 --peso 420
```

| Archivo | Qué es |
|---|---|
| `PROMPT.md` | El prompt maestro que originó todo esto |
| `docs/00-antecedentes.md` | Qué ya existe, qué se copió, con qué licencia, y la competencia |
| `docs/01-arquitectura-datos.md` | Por qué la base está hecha así |
| `docs/02-instalacion.md` | Paso a paso para dejar la PC lista |
| `docs/03-protocolo-de-vuelo.md` | La parte que se ejecuta con las manos |
| `base/*.sql` | El esquema, ejecutable |
| `Makefile` | `make pruebas`, `make verificar`, `make sql`, `make esquema` |

---

## Arquitectura: dos capas

```
motor/dominio/   El criterio agronómico. SIN numpy ni GDAL.
                 Se prueba en cualquier máquina, sin instalar nada.

motor/raster/    Aritmética masiva e I/O. CON numpy y rasterio.
                 Delgada a propósito: no toma NINGUNA decisión agronómica.
```

La frontera no es estética: el día que cambie la librería de rásters, el criterio no se toca.

**La pieza que hace que esa separación rinda** es `dominio/formula.py`. Los índices se declaran
como texto (`(nir - rededge) / (nir + rededge)`) y se evalúan parseando con `ast`, con lista
blanca de nodos — nunca `eval`, porque el catálogo es un archivo editable y `eval` sobre un
archivo editable es ejecutar código ajeno. Como numpy sobrecarga los operadores, **el mismo
evaluador corre sobre escalares y sobre arrays**: probarlo con dos decimales ejercita el código
que después procesa millones de píxeles.

---

## Las reglas que el motor hace cumplir

No son documentación: son restricciones, con su prueba y, donde corresponde, con su `CHECK` en
la base.

1. **Sin calibración radiométrica no hay serie temporal.** Un vuelo sin panel ni DLS produce
   números digitales, no reflectancia: cambian con la nubosidad. La restricción `chk_comparable`
   lo impide en la base, `Manifiesto` lo impide antes de escribir el archivo, y la vista
   `indice.serie_comparable` es la única forma de consultar evolución en el tiempo.

2. **Sin franja de referencia no hay dosis de nitrógeno.** El índice de suficiencia necesita un
   denominador. Lo que sí se entrega es un **mapa de variabilidad**, que se llama así y viene con
   la advertencia de por qué no es lo mismo.

3. **Una recomendación sin fuente no se construye.** `Recomendacion` lo rechaza en el
   constructor; `manejo.recomendacion.fuente` es `NOT NULL`.

4. **Ninguna banda se sustituye por otra parecida.** El Mavic 3M no tiene azul, así que EVI y
   ARVI quedan deshabilitados **y reportados**, y el motor ofrece EVI2 — que es la versión
   publicada para sensores sin azul, no un apaño.

5. **No hay fórmula de biomasa precargada.** Hay calibración local contra cortes o plato de
   levante, con el R² informado y una advertencia explícita cuando el ajuste es pobre. La
   bibliografía regional reporta R² ≈ 0,41 en pasturas de verano: ese aviso va a saltar seguido,
   y es la parte más útil del módulo.

6. **Una caída de vigor demasiado grande no se fertiliza: se va a mirar.** Por debajo del umbral
   de respuesta, la diferencia rara vez es nitrógeno —suele ser agua, compactación, pH o una
   falla de siembra— y echarle urea es tirar plata. Esa es la regla que separa un modelo de un
   agrónomo.

7. **Nunca se calculan hectáreas en grados.** El trigger de `nucleo.lote` reproyecta a la UTM del
   campo; la zonificación rechaza un ortomosaico en coordenadas geográficas.

---

## Convenciones

Las de la casa, ya en uso en `../public/js/`: **todo en español** —funciones, variables, tablas,
columnas y comentarios—, cabecera en caja de `═` diciendo qué hace el archivo y **por qué
existe**, y comentarios que explican el porqué. Si un umbral vale 0,60, el comentario dice de
dónde sale ese 0,60.

Sin frameworks. Sin ORM. Sin servicios pagos. Sin `eval`.

---

## Regla que manda sobre todas las demás

Cada número que el sistema entrega tiene que poder defenderse frente a un agrónomo que pregunte
de dónde salió.

**Un modelo sin supuestos declarados es una opinión con decimales.**
