# Servidor de IA local · AgroTitan

Un motor de lenguaje corriendo en tu propia máquina, con una API
compatible con OpenAI en `http://localhost:11434/v1` y una interfaz de
chat en `http://localhost:3000`.

Nada de lo que le preguntes sale de la máquina: no hay servicio externo,
no hay cuenta, no hay factura por token. A cambio, la velocidad depende
del hardware que tengas.

---

## Puesta en marcha

Requisitos: Docker y el plugin `docker compose`. Nada más.

```bash
cd servidor-ia
make instalar
```

Ese comando verifica el entorno, crea el `.env`, levanta los
contenedores, detecta si hay GPU y baja los modelos. La primera vez
tarda: son varios GB de descarga.

Cuando termina, verificá que quedó realmente en condiciones:

```bash
make probar
```

Esa prueba comprueba las cuatro cosas que importan: que el motor
responda, que los modelos estén descargados, que conteste una consulta
—midiendo cuántos tokens por segundo da tu máquina— y que genere
embeddings. Si algo falla, dice cuál y qué hacer.

Después, a usarlo:

```bash
./ejemplos/consulta.sh "Contame en una línea qué sabés hacer."
```

---

## Comandos

`make` sin argumentos lista todo. Los que se usan a diario:

| Comando              | Qué hace                                          |
| -------------------- | ------------------------------------------------- |
| `make arriba`        | Levanta el servidor (CPU)                         |
| `make arriba-gpu`    | Levanta el servidor usando la GPU NVIDIA          |
| `make arriba-api`    | Solo la API, sin interfaz web                     |
| `make abajo`         | Apaga (los modelos descargados se conservan)      |
| `make estado`        | Si está vivo, qué modelos hay, qué está en RAM    |
| `make probar`        | Prueba de humo de punta a punta                   |
| `make logs`          | Logs en vivo                                      |
| `make chat`          | Chat en la terminal, sin navegador                |
| `make modelos`       | Baja los modelos del `.env`                       |
| `make actualizar`    | Baja imágenes nuevas y reinicia                   |
| `make respaldo`      | Copia modelos e historial a `respaldos/`          |
| `make autoarranque`  | Que se levante solo al prender la máquina         |

---

## Qué modelo elegir

El límite real es la memoria. Un modelo cuantizado a 4 bits ocupa
aproximadamente `parámetros × 0,6 GB`, más el contexto. Si no entra en
RAM (o en VRAM, si usás GPU), el sistema empieza a usar disco y la
velocidad se cae por un precipicio.

| RAM / VRAM | Modelo sugerido            | Para qué sirve                                      |
| ---------- | -------------------------- | --------------------------------------------------- |
| 8 GB       | `qwen2.5:3b-instruct`      | Resúmenes, reescritura, tareas cortas                |
| 16 GB      | `qwen2.5:7b-instruct`      | Uso general. **Es el default.**                     |
| 16 GB      | `qwen2.5-coder:7b`         | Código, si vas a usarlo sobre todo para programar    |
| 32 GB      | `qwen2.5:14b-instruct`     | Razonamiento más largo, textos técnicos              |
| 48 GB+     | `qwen2.5:32b-instruct`     | Lo mejor que corre cómodo en una máquina de escritorio |

Cambiar de modelo son dos pasos:

```bash
make bajar-modelo M=qwen2.5:14b-instruct   # descargarlo
sed -i 's/^MODELO=.*/MODELO=qwen2.5:14b-instruct/' .env
make reiniciar
```

Los modelos publicados están en <https://ollama.com/library>.

### Embeddings

`nomic-embed-text` viene incluido. Sirve para búsqueda semántica sobre
documentos propios —informes, planillas, normativa— sin mandarlos a
ningún lado:

```bash
curl -s http://localhost:11434/v1/embeddings \
  -H 'Content-Type: application/json' \
  -d '{"model":"nomic-embed-text","input":"margen bruto por hectárea"}' \
  | jq '.data[0].embedding | length'
```

Hay un ejemplo completo que los usa: ver **Consultar documentos propios**,
más abajo.

---

## Conectar un cliente

La API habla el protocolo de OpenAI, así que cualquier herramienta que
ya lo soporte funciona cambiándole dos valores:

```
base_url = http://localhost:11434/v1
api_key  = local        (el servidor la ignora, pero el protocolo la exige)
model    = qwen2.5:7b-instruct
```

Hay tres ejemplos completos en `ejemplos/`: uno en `curl`
(`consulta.sh`), otro en Python con el SDK de OpenAI y respuesta en
streaming (`consulta.py`), y uno que consulta documentos propios
(`documentos.py`, más abajo).

Para **TITANOMAQUIA** u otro proceso que corra en la misma máquina,
apuntalo a `http://localhost:11434/v1`. Si corre dentro de otro
contenedor Docker, usá `http://host.docker.internal:11434/v1` en lugar
de `localhost`.

---

## Consultar documentos propios

El caso concreto: tenés informes, normativa, planillas exportadas, y
querés preguntarles cosas sin subirlos a ningún servicio.

```bash
# indexar una carpeta (.txt, .md, .csv)
python3 ejemplos/documentos.py indexar ~/agrotitan/informes

# preguntar
python3 ejemplos/documentos.py preguntar "¿Qué rinde asumimos para nogal?"
```

El script corta los documentos en fragmentos, los convierte en vectores
con el modelo de embeddings, busca los cinco más parecidos a tu pregunta
y se los pasa al modelo como contexto. Es RAG en su versión mínima: sin
base de datos vectorial y sin dependencias fuera de la biblioteca
estándar de Python.

El modelo tiene instrucción de citar el archivo de donde sacó cada dato
y de decir que no sabe cuando la respuesta no está en los documentos, en
vez de inventarla. Igual conviene verificar: sigue siendo un modelo de
lenguaje, y con documentos técnicos el riesgo de que mezcle cifras de
dos informes distintos es real.

Para PDFs, convertilos antes:

```bash
pdftotext informe.pdf informe.txt
```

El índice queda en `.indice.json` y no se versiona. Hay que rehacerlo si
cambiás los documentos o el modelo de embeddings —el script avisa en ese
segundo caso en vez de devolver resultados sin sentido.

---

## Configuración

Todo está en `.env` (se crea desde `.env.ejemplo` en la instalación y no
se versiona). Lo que más se toca:

- `MODELO` — el modelo por defecto de los ejemplos y de `make chat`.
- `CONTEXTO` — tokens de ventana. Más contexto, más RAM.
- `OLLAMA_KEEP_ALIVE` — cuánto queda un modelo en memoria sin uso.
  Subilo si notás demora en la primera consulta después de un rato;
  ponelo en `0` si necesitás liberar RAM enseguida.
- `OLLAMA_NUM_PARALLEL` — consultas simultáneas por modelo.

Después de editarlo: `make reiniciar`.

---

## Exponer en la red

Por defecto los puertos se publican solo en `127.0.0.1`: desde otra
máquina no se llega, ni siquiera dentro de la misma oficina. Es a
propósito, porque **la API no tiene autenticación**: quien la alcanza,
la usa.

Si necesitás llegar desde otra máquina de la red local, en `.env`:

```
BIND_HOST=0.0.0.0
WEBUI_AUTH=true
```

y `make reiniciar`. Antes de hacerlo, tené en cuenta que:

- La API de `:11434` queda **abierta a cualquiera de la red**. Si la red
  no es de confianza, poné un proxy inverso con autenticación adelante,
  o dejá `BIND_HOST=127.0.0.1` y llegá por túnel SSH:
  `ssh -L 11434:localhost:11434 usuario@servidor`.
- La interfaz web de `:3000` sí pide usuario y contraseña con
  `WEBUI_AUTH=true`. El primero que se registra queda como
  administrador, así que registrate vos apenas la levantes.
- Nunca abras estos puertos hacia internet sin un proxy con TLS y
  autenticación adelante.

---

## GPU

Sin GPU funciona igual, más lento. Para verificar si la tuya se puede
usar:

```bash
make check-gpu
```

Si el chequeo pasa, `make arriba-gpu`. Requiere el
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
instalado en el host. En Mac con chip Apple, Docker no puede acceder a
la GPU: para aprovecharla hay que instalar Ollama nativo
(`brew install ollama`) en vez de usar este compose.

---

## Que arranque solo

En una máquina que va a hacer de servidor conviene que el servicio vuelva
solo después de un corte de luz o un reinicio:

```bash
make autoarranque
```

En Linux instala una unidad de systemd (pide `sudo`) que levanta el
servidor en cada arranque, usando GPU si la detecta. Para desactivarlo,
`make sin-autoarranque`.

En macOS no hace falta: los contenedores ya están definidos con
`restart: unless-stopped`, así que alcanza con que Docker Desktop
arranque al iniciar sesión.

---

## Problemas frecuentes

**Tarda muchísimo la primera consulta.** El modelo se carga en memoria
recién cuando llega el primer pedido. Las siguientes son rápidas
mientras siga cargado (`make estado` muestra qué hay en RAM).

**"no space left on device".** Los modelos ocupan varios GB en el
volumen de Docker. Mirá con `docker system df` y borrá lo que no uses
con `make borrar-modelo M=...`.

**Se cuelga o va lentísimo.** El modelo probablemente no entra en
memoria y está paginando a disco. Bajá a uno más chico o reducí
`CONTEXTO`.

**El puerto ya está en uso.** Cambiá `PUERTO_API` o `PUERTO_WEB` en
`.env` y reiniciá.

**Empezar de cero.** `make limpiar` borra contenedores, modelos e
historial. Pide confirmación escrita porque no hay vuelta atrás.

---

## Cómo está armado

```
servidor-ia/
├── compose.yaml        motor (ollama) + interfaz web
├── compose.gpu.yaml    override para GPU NVIDIA
├── .env.ejemplo        plantilla de configuración
├── Makefile            atajos
├── scripts/            instalación, prueba, estado, modelos, respaldo,
│                    arranque automático
└── ejemplos/           clientes en bash y Python, y consulta sobre
                     documentos propios
```

Los modelos viven en el volumen `agrotitan-ia_modelos` y el historial de
la web en `agrotitan-ia_web`. Sobreviven a `make abajo` y a
`make actualizar`; solo `make limpiar` los borra.
