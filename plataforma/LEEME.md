# Plataforma de análisis multiespectral para agricultura de precisión

Software que toma imágenes de **drones multiespectrales**, produce mapas de agricultura de
precisión y **sugiere decisiones** para **agricultura extensiva y ganadería**.

**Estado: etapa de planificación.** Acá hay documentos y el esquema de base de datos.
Todavía no hay código de aplicación — se construye a partir de `PROMPT.md`.

> Este directorio es independiente del sitio institucional que vive en `../public/`.
> Está pensado para poder extraerse a su propio repositorio sin dolor.

---

## Por dónde empezar

| Archivo | Qué es |
|---|---|
| **`PROMPT.md`** | **El prompt maestro.** Se pega tal cual en una sesión nueva de Claude para construir el motor. Es autosuficiente. |
| `docs/00-antecedentes.md` | Qué ya existe, qué se copia, con qué licencia, y quién es la competencia |
| `docs/01-arquitectura-datos.md` | Por qué la base está hecha así. El SQL manda; esto lo justifica |
| `docs/02-instalacion.md` | Paso a paso para dejar la PC lista |
| `docs/03-protocolo-de-vuelo.md` | La parte que se ejecuta con las manos, y que decide si los datos sirven |
| `base/*.sql` | El esquema de datos, ejecutable |
| `entorno.yml` · `docker-compose.yml` | Entorno Python y PostGIS de desarrollo |

---

## Las tres cosas que hay que saber antes de tocar nada

**1. Sin calibración radiométrica no hay serie temporal.**
Sin panel de reflectancia y sensor de luz descendente, dos vuelos de fechas distintas no son
comparables: se comparan números digitales que cambian con la nubosidad. Es física, no software,
y es todo el valor del producto. La base de datos lo impide, no lo avisa.

**2. La relación índice↔biomasa es local.**
No hay fórmula universal de NDVI a kilos de materia seca. Hay un módulo de calibración que ajusta
la regresión con cortes o plato de levante, informa su R² y **advierte cuando el ajuste es pobre**.

**3. Esta PC no tiene GPU útil para esto.**
La RX 570 no es CUDA (OpenDroneMap solo acelera con NVIDIA) ni está soportada por ROCm. El diseño
es **CPU-only**, con procesamiento por ventanas y un techo de memoria de 4 GB que se audita en cada
corrida.

---

## Regla que manda sobre todas las demás

Cada número que el sistema entrega tiene que poder defenderse frente a un agrónomo que pregunte de
dónde salió.

**Un modelo sin supuestos declarados es una opinión con decimales.**
