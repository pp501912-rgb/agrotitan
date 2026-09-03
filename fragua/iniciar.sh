#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  FRAGUA · arranque en macOS y Linux
# ══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  No encuentro Node.js en esta computadora."
  echo
  echo "  Bajalo de https://nodejs.org (la versión LTS), instalalo,"
  echo "  y volvé a correr este script."
  echo
  exit 1
fi

if [ ! -f .env ]; then
  echo
  echo "  No hay archivo .env todavía. Copio el de ejemplo."
  cp .env.ejemplo .env
  echo "  Listo: abrí .env y pegá tu clave de Claude."
  echo "  La app arranca igual sin ella, pero sin el chat."
  echo
fi

( sleep 2
  command -v open    >/dev/null 2>&1 && open    http://127.0.0.1:4321 ||
  command -v xdg-open >/dev/null 2>&1 && xdg-open http://127.0.0.1:4321 ||
  true ) &

exec node servidor/index.mjs
