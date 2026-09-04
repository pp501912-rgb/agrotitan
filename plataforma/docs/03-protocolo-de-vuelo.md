# Protocolo de vuelo

> El mejor software del mundo no arregla un vuelo mal hecho. Este documento es la parte del
> proyecto que se ejecuta con las manos, y define si los datos van a servir para algo.

---

## Regla número uno: sin calibración radiométrica no hay serie temporal

Sin panel de reflectancia calibrado y sensor de luz descendente (DLS/ILS), lo que se compara entre
dos vuelos son **números digitales**, que cambian con la nubosidad y no significan nada. Toda la
propuesta de valor del producto —ver cómo evoluciona un lote en el tiempo— depende de este paso.

Es una restricción física, no de software. La base de datos la aplica: un vuelo sin
`calibracion_id` **no puede** marcarse como `comparable`.

**Cómo se hace bien:**

- Fotografiar el panel calibrado **antes y después** de cada vuelo.
- Hacerlo **a altura de vuelo**, no a un metro del suelo. Un trabajo de 2024 sobre exposición y
  calibración encontró que el panel a altura de vuelo da mejor exactitud que confiar únicamente en
  el sensor de luz incidente.
- Panel sin sombras, sin reflejos del operador, centrado en el cuadro.
- Registrar el número de serie del panel: sus valores de reflectancia son propios de ese panel y
  van en `sensor.calibracion.coeficientes`.

---

## Parámetros de vuelo

| Parámetro | Valor | Por qué |
|---|---|---|
| Solape frontal | **75 %** | Menos que esto y la fotogrametría empieza a fallar en zonas de textura uniforme, que en un lote agrícola son casi todas |
| Solape lateral | **75 %** | Ídem |
| Orientación de cámara | **Nadir** (90°, apuntando abajo) | Cualquier inclinación mete efectos direccionales de reflectancia que arruinan la comparación entre fechas |
| Altura | Constante, según GSD buscado | Cambiar de altura entre vuelos cambia el GSD y con él las estadísticas |
| Ventana horaria | **±2 h del mediodía solar** | Fuera de eso el ángulo solar bajo alarga las sombras y baja la señal |
| Nubosidad | Despejado o **totalmente** cubierto | Lo peor es el día parcialmente nublado: la iluminación cambia entre pasadas del mismo vuelo |
| Viento | < 25 km/h | Por estabilidad del vuelo y porque el canopeo en movimiento arruina la coincidencia entre bandas |

**Todos estos valores se registran en `vuelo.vuelo`**, no porque queden lindos, sino porque cuando
dos vuelos no se parecen hay que poder mirar por qué.

---

## Extensivos: la franja de referencia de nitrógeno

**Sin esto no hay recomendación de dosis de N.** El método del índice de suficiencia es

```
SI = NDRE_lote / NDRE_franja_referencia
```

y sin franja de referencia no hay denominador. El motor, en ese caso, entrega un **mapa de
variabilidad** —que es útil— y **se niega explícitamente** a llamarlo recomendación de dosis.

**Cómo se instala:**

- Una franja sobrefertilizada con N, dentro del mismo lote y en el mismo ambiente.
- Aplicada **al menos dos semanas antes** del vuelo, para que el cultivo haya podido responder.
- Suficientemente ancha como para que se puedan tomar píxeles interiores sin contaminación del
  borde.
- Se carga en `campo.franja_referencia_n` con su geometría, fecha y dosis aplicada.

**Por qué NDRE y no NDVI:** el NDVI satura en canopeo denso, justo en el momento en que hay que
decidir la refertilización. El borde rojo (*red edge*) es sensible a la clorofila del canopeo sin
saturar, y por eso es el índice consolidado para nitrógeno en trigo y maíz.

---

## Ganadería: calibración de biomasa

**No existe una fórmula universal de NDVI a kilos de materia seca.** La relación es local: depende
de la especie, el estado fenológico, la estación y el manejo. La literatura regional reporta
R² en torno a **0,41** en pasturas de verano. Eso no es un mal trabajo: es la naturaleza del dato.

Por eso el software **no trae fórmula precargada**, sino un módulo de calibración.

**Qué hay que hacer el mismo día del vuelo:**

- **Cortes**: cuadrantes de superficie conocida, cortados, pesados en verde y secados en estufa
  para materia seca. Es el patrón oro.
- **Plato de levante (pasturómetro)**: mide altura comprimida; se convierte a kg MS/ha con una
  ecuación local. Mucho más rápido; sirve si hay una ecuación de la zona.
- **Método de rendimiento comparativo (COMPYLD)**: cuadrantes distribuidos en el potrero con
  estimación visual, altura, lectura de plato y algunos cortes de anclaje. Es el mejor
  compromiso entre precisión y tiempo, y es lo que usa la bibliografía de referencia.

**Mínimo recomendado:** 20-25 puntos por potrero, cubriendo todo el rango de biomasa disponible
—no solo lo lindo—. Se cargan en `campo.corte_biomasa` y `campo.lectura_plato`.

El motor ajusta la regresión, guarda el R² en `ganaderia.calibracion_biomasa` y marca
`ajuste_pobre = true` cuando cae por debajo de 0,60. **Ese aviso hay que leerlo**: por debajo de
ese umbral el número no debería usarse para decidir carga animal.

---

## Marco regulatorio — Argentina, 2026

Resoluciones **ANAC 311, 312 y 313/2026**, que actualizaron las RAAC (Partes 91, 100 y 137).

**Categoría abierta** — donde entra cómodo un dron de relevamiento:

- Operación dentro del alcance visual del piloto (VLOS)
- Altura máxima **122 m**
- Equipos de hasta **25 kg**
- **No exige licencia de piloto**: alcanza con el registro digital del dron ante ANAC y la
  acreditación gratuita de conocimientos básicos

**Fuera de categoría abierta** (más de 25 kg o uso específico, como un dron de pulverización):

- Registro obligatorio de la aeronave
- Licencia aeronáutica de piloto a distancia (RAAC Parte 61, Subparte L)
- Certificación Médica Aeronáutica Clase 3 (RAAC Parte 67)

Verificar siempre la normativa vigente antes de operar; esto es un resumen de trabajo, no
asesoramiento legal.

---

## Lista de control, para llevar al campo

**Antes de salir**

- [ ] Baterías cargadas (drone y control)
- [ ] Panel de reflectancia en la mochila, limpio y sin rayaduras
- [ ] Tarjeta de memoria vacía y con espacio suficiente
- [ ] Misión cargada: 75/75, nadir, altura fija
- [ ] Franja de referencia de N instalada hace ≥ 2 semanas (si se va a recomendar N)
- [ ] Bolsas, tijera y balanza si se van a hacer cortes

**En el lote**

- [ ] Foto del panel a altura de vuelo, **antes** del vuelo
- [ ] Registrar hora de inicio, nubosidad y viento
- [ ] Volar
- [ ] Foto del panel a altura de vuelo, **después** del vuelo
- [ ] Tomar los puntos de verdad de terreno (cortes / plato), georreferenciados

**Al volver**

- [ ] Descargar imágenes a la carpeta del vuelo, con la convención de rutas
- [ ] Cargar el vuelo en la base con su calibración
- [ ] Cargar los puntos de terreno
- [ ] Procesar
