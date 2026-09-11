#!/usr/bin/env bash
# Consulta suelta desde la terminal:
#   ./ejemplos/consulta.sh "¿Qué margen bruto deja una hectárea de nogal?"
#
# Usa el endpoint compatible con OpenAI, así que sirve de plantilla
# para cualquier cliente que ya hable ese protocolo.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cfg() { local v=''; [ -f "$RAIZ/.env" ] && v="$(sed -n "s/^$1=//p" "$RAIZ/.env" | head -1 | tr -d '\r')"; echo "${v:-$2}"; }

MODELO="${MODELO:-$(cfg MODELO qwen2.5:7b-instruct)}"
PUERTO="$(cfg PUERTO_API 11434)"
API="http://localhost:${PUERTO}/v1"

PREGUNTA="${*:-Contame en una línea qué sabés hacer.}"

if ! command -v jq >/dev/null 2>&1; then
  echo "Falta 'jq' (se usa para armar y leer el JSON)." >&2
  echo "  Debian/Ubuntu:  sudo apt install jq" >&2
  echo "  macOS:          brew install jq" >&2
  exit 1
fi

if ! curl -fsS --max-time 5 "http://localhost:${PUERTO}/api/version" >/dev/null 2>&1; then
  echo "El servidor no responde en http://localhost:${PUERTO}" >&2
  echo "  Levantalo con:  make arriba" >&2
  exit 1
fi

# La clave es obligatoria en el protocolo pero el servidor local la ignora.
curl -fsS "$API/chat/completions" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local' \
  -d "$(jq -n --arg m "$MODELO" --arg p "$PREGUNTA" '{
        model: $m,
        messages: [
          {role: "system", content: "Respondé en español rioplatense, claro y sin rodeos."},
          {role: "user",   content: $p}
        ],
        temperature: 0.3
      }')" \
  | jq -r '.choices[0].message.content'
