# Datos pendientes · estado real al 5 de septiembre de 2026

El documento de comprensión (PR #1, 2 de septiembre) pedía 13 datos en su
sección 8. Ese documento se escribió mirando el commit del 31 de agosto.
**El sitio se actualizó el 3 de septiembre y buena parte de esos datos ya
están publicados**, así que la lista quedó vieja.

Esto es el cruce, verificado contra `public/index.html` en el commit
`e3b8eb3`. Todo lo marcado como resuelto está textualmente en la página;
lo podés comprobar con `python3 herramientas/verificar-contenido.py`.

---

## Ya no hacen falta: 7 de 13

| # | Dato | Cómo quedó publicado |
|---|------|----------------------|
| 1 | Años de trayectoria | **10 años** evaluando proyectos agropecuarios |
| 5 | Provincias y regiones | Río Negro, Buenos Aires, Mendoza, San Juan y Araucanía |
| 6 | Credenciales del equipo | 3 ingenieros agrónomos y 2 zootecnistas · UNLZ, UBA y UCA · más de 30 años combinados |
| 7 | Índice del Informe Titánico | Los 7 capítulos, con su detalle. Era «lo más importante de esta lista» |
| 11 | Fuentes de datos | Valores de referencia de la zona, ensayos y series propias |
| 12 | Definiciones metodológicas | Las 8, declaradas: moneda, tasa, horizonte, impuestos, flujo evaluado, fuentes, riesgo y relevamiento |
| 8 | Rango de precio por etapa | **Resuelto por decisión, no por dato.** La página no publica precios: publica el camino por el que se define uno («Cómo empezamos, y cómo se define el precio»). Es una respuesta válida y hay que tratarla como cerrada |

## Siguen faltando: 6

| # | Dato | Por qué importa | Dificultad |
|---|------|-----------------|------------|
| 10 | **Correo con dominio propio** | Hoy la página de una consultora que evalúa inversiones millonarias contesta desde un Gmail personal. Es lo más barato de arreglar y lo que más credibilidad devuelve | Trivial |
| 9 | Plazos de entrega por etapa, en semanas | Filtra al que tiene un apuro imposible antes de la entrevista | Solo vos lo sabés |
| 2 | Cantidad de proyectos evaluados | Prueba de volumen. Hoy hay años y rubros, pero no cuántos trabajos | Solo vos lo sabés |
| 4 | Monto de inversión evaluado | Es la cifra que más le habla al inversor. Puede ir por rangos | Solo vos lo sabés |
| 13 | Fotos propias | La página no tiene ni una foto: sólo dos isotipos SVG y la imagen de compartir. Campo, monte, galpón o pantalla de trabajo, sin identificar clientes | Requiere material |
| 6b | Matrícula y colegio profesional | Quedó a medias: hay títulos y universidades, falta el estado de matrícula. En una profesión colegiada es lo que separa «somos agrónomos» de una credencial verificable | Solo vos lo sabés |

## Uno cambió de significado

**#3 · Hectáreas analizadas.** La página publica *130 ha de superficie
promedio por proyecto*, que no es lo mismo que el total de hectáreas
analizadas. El promedio le dice al visitante si su campo entra en la escala
que manejan; el acumulado sería prueba de volumen. Son dos datos distintos y
hoy está el primero. Decidí si querés además el segundo.

---

## Lo que yo haría con esto

**Primero el correo con dominio propio (#10).** Es el único de los seis que
no depende de que te sientes a juntar datos, y es el que más pesa: un
inversor que está por confiarte una decisión de capital lee `@gmail.com` y
descuenta. Con el dominio propio también se resuelve la dirección del sitio,
que hoy es `agrotitan.inversionesdelagro.workers.dev` — una URL que se ve
como infraestructura, no como una marca.

**Después #2, #4 y #9 juntos**, que son los tres que salen de mirar tus
propios registros. Con esos tres la portada pasa de tener cifras de
capacidad (años, rubros, escala) a tener también cifras de trabajo hecho.

**#13 y #6b pueden esperar**, pero la página sin ninguna foto propia se lee
más fría de lo que hace falta.

---

## Nota sobre la propuesta de rediseño

La maqueta de `propuesta/index.html` (PR #1) tiene **37 marcadores `falta`**
que se escribieron cuando estos datos no estaban. Al menos los de las siete
filas resueltas ya se pueden completar desde el sitio actual. Conviene hacer
ese pase antes de volver a revisarla, para que lo que quede resaltado sea de
verdad lo que falta y no ruido viejo.
