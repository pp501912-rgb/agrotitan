#!/usr/bin/env bash
# Puesta en marcha inicial: requisitos, .env, arranque y descarga de modelos.
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

titulo "1 · Requisitos"

if ! command -v docker >/dev/null 2>&1; then
  error "Docker no está instalado."
  echo "     Instalalo desde https://docs.docker.com/get-docker/ y volvé a correr esto."
  exit 1
fi
ok "docker $(docker --version | sed 's/Docker version //; s/,.*//')"

if ! docker compose version >/dev/null 2>&1; then
  error "Falta el plugin 'docker compose' (v2 o superior)."
  exit 1
fi
ok "docker compose $(docker compose version --short 2>/dev/null || echo '?')"

if ! docker info >/dev/null 2>&1; then
  error "El demonio de Docker no responde. ¿Está arrancado? ¿Tu usuario está en el grupo 'docker'?"
  exit 1
fi
ok "el demonio de Docker responde"

# Memoria disponible: define qué modelos tienen sentido.
if [ -r /proc/meminfo ]; then
  RAM_GB=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo) / 1024 / 1024 ))
  if [ "$RAM_GB" -lt 8 ]; then
    aviso "RAM total: ${RAM_GB} GB. Con menos de 8 GB usá modelos de 3B o menos."
  else
    ok "RAM total: ${RAM_GB} GB"
  fi
fi

titulo "2 · Configuración"

if [ -f .env ]; then
  ok ".env ya existe, no lo toco"
else
  cp .env.ejemplo .env
  ok ".env creado a partir de .env.ejemplo"
fi

MODELO="$(cfg MODELO qwen2.5:7b-instruct)"
MODELO_EMB="$(cfg MODELO_EMBEDDINGS nomic-embed-text)"
PUERTO_API="$(cfg PUERTO_API 11434)"
PUERTO_WEB="$(cfg PUERTO_WEB 3000)"
echo "     modelo de chat:  $MODELO"
echo "     embeddings:      $MODELO_EMB"

titulo "3 · Arranque"

if command -v nvidia-smi >/dev/null 2>&1 && docker run --rm --gpus all ollama/ollama:latest nvidia-smi -L >/dev/null 2>&1; then
  ok "GPU NVIDIA disponible, levanto con aceleración"
  docker compose -f compose.yaml -f compose.gpu.yaml --profile web up -d
else
  aviso "sin GPU utilizable, levanto en CPU (funciona, pero más lento)"
  docker compose --profile web up -d
fi

printf '     esperando a que el motor responda'
for _ in $(seq 1 60); do
  if vivo && ollama list >/dev/null 2>&1; then echo; ok "motor listo"; break; fi
  printf '.'; sleep 2
done
echo

if ! ollama list >/dev/null 2>&1; then
  error "El motor no respondió a tiempo. Mirá qué pasó con:  make logs"
  exit 1
fi

titulo "4 · Modelos"
echo "     La primera descarga tarda: son varios GB."
./scripts/modelos.sh bajar

titulo "Listo"
echo "     API (compatible con OpenAI):  http://localhost:${PUERTO_API}/v1"
echo "     Interfaz de chat:             http://localhost:${PUERTO_WEB}"
echo
echo "     Probalo:      ./ejemplos/consulta.sh 'Hola, ¿andás?'"
echo "     Estado:       make estado"
echo "     Apagar:       make abajo"
echo
