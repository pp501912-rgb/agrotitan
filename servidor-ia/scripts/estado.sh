#!/usr/bin/env bash
# Diagnóstico rápido: contenedores, API, modelos y qué hay cargado en RAM.
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

PUERTO_API="$(cfg PUERTO_API 11434)"
PUERTO_WEB="$(cfg PUERTO_WEB 3000)"
HOST="$(cfg BIND_HOST 127.0.0.1)"
[ "$HOST" = "0.0.0.0" ] && HOST=localhost

titulo "Contenedores"
LISTA=$(docker compose --profile web ps --format '{{.Service}}|{{.State}}|{{.Status}}' 2>/dev/null || true)
if [ -n "$LISTA" ]; then
  echo "$LISTA" | awk -F'|' '{printf "  %-10s %-10s %s\n", $1, $2, $3}'
else
  aviso "no hay contenedores de este proyecto (levantalo con: make arriba)"
fi

titulo "API"
if curl -fsS --max-time 5 "http://${HOST}:${PUERTO_API}/api/version" >/dev/null 2>&1; then
  VER=$(curl -fsS --max-time 5 "http://${HOST}:${PUERTO_API}/api/version" | sed 's/.*"version":"\([^"]*\)".*/\1/')
  ok "responde en http://${HOST}:${PUERTO_API}  (ollama $VER)"
  echo "     endpoint compatible con OpenAI:  http://${HOST}:${PUERTO_API}/v1"
else
  error "no responde en http://${HOST}:${PUERTO_API}"
  echo "     probá:  make logs"
fi

if docker inspect -f '{{.State.Running}}' agrotitan-ia-web >/dev/null 2>&1; then
  titulo "Interfaz web"
  ok "http://${HOST}:${PUERTO_WEB}"
fi

if vivo; then
  titulo "Modelos descargados"
  ollama list 2>/dev/null | sed 's/^/  /'

  titulo "Cargados en memoria ahora"
  SALIDA=$(ollama ps 2>/dev/null | tail -n +2 || true)
  if [ -n "$SALIDA" ]; then
    ollama ps 2>/dev/null | sed 's/^/  /'
  else
    echo "  ninguno (se cargan solos con la primera consulta)"
  fi
fi
echo
