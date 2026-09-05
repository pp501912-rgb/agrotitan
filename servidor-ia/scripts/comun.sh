#!/usr/bin/env bash
# Funciones compartidas por los demás scripts. No se ejecuta solo.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

if [ -t 1 ]; then
  ROJO=$'\033[31m'; VERDE=$'\033[32m'; AMARILLO=$'\033[33m'; NEGRITA=$'\033[1m'; FIN=$'\033[0m'
else
  ROJO=''; VERDE=''; AMARILLO=''; NEGRITA=''; FIN=''
fi

ok()    { echo "  ${VERDE}✓${FIN} $*"; }
aviso() { echo "  ${AMARILLO}!${FIN} $*"; }
error() { echo "  ${ROJO}✗${FIN} $*" >&2; }
titulo(){ echo; echo "${NEGRITA}$*${FIN}"; }

# Lee una variable del .env (o devuelve el default que se le pase).
cfg() {
  local clave="$1" default="${2:-}" valor=''
  [ -f .env ] && valor="$(sed -n "s/^${clave}=//p" .env | head -1 | tr -d '\r')"
  echo "${valor:-$default}"
}

CONTENEDOR=agrotitan-ollama

# ¿Está corriendo el contenedor de Ollama?
vivo() { [ "$(docker inspect -f '{{.State.Running}}' "$CONTENEDOR" 2>/dev/null)" = "true" ]; }

# Ejecuta el cliente de ollama dentro del contenedor.
ollama() { docker exec -i "$CONTENEDOR" ollama "$@"; }

exigir_vivo() {
  if ! vivo; then
    error "El servidor no está corriendo. Levantalo con:  make arriba"
    exit 1
  fi
}
