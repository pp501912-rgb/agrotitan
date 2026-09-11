#!/usr/bin/env bash
# Prueba de humo: verifica que el servidor esté realmente en condiciones
# de responder, no solo que el contenedor esté prendido.
#   make probar
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

PUERTO="$(cfg PUERTO_API 11434)"
HOST="$(cfg BIND_HOST 127.0.0.1)"; [ "$HOST" = "0.0.0.0" ] && HOST=localhost
API="http://${HOST}:${PUERTO}"
MODELO="$(cfg MODELO qwen2.5:7b-instruct)"
MODELO_EMB="$(cfg MODELO_EMBEDDINGS nomic-embed-text)"

FALLAS=0
falla() { error "$*"; FALLAS=$((FALLAS + 1)); }

for req in curl jq; do
  command -v "$req" >/dev/null 2>&1 || { error "falta '$req', necesario para esta prueba"; exit 1; }
done

titulo "1 · El motor responde"
if VER=$(curl -fsS --max-time 5 "$API/api/version" 2>/dev/null | jq -r '.version'); then
  ok "ollama $VER en $API"
else
  falla "sin respuesta en $API — ¿corriste 'make arriba'?"
  echo; echo "  ${ROJO}Prueba abortada.${FIN}"; echo; exit 1
fi

titulo "2 · Los modelos están descargados"
DISPONIBLES=$(curl -fsS --max-time 10 "$API/api/tags" | jq -r '.models[].name')
for m in "$MODELO" "$MODELO_EMB"; do
  # El tag ":latest" es implícito: qwen2.5:7b y qwen2.5:7b:latest son el mismo.
  if grep -qx -e "$m" -e "${m}:latest" <<<"$DISPONIBLES"; then
    ok "$m"
  else
    falla "$m no está descargado — corré 'make modelos'"
  fi
done

titulo "3 · Responde una consulta"
INICIO=$(date +%s)
CUERPO=$(jq -n --arg m "$MODELO" '{
  model: $m,
  messages: [{role: "user", content: "Respondé únicamente con la palabra: listo"}],
  temperature: 0,
  stream: false
}')
if RTA=$(curl -fsS --max-time 180 "$API/v1/chat/completions" \
          -H 'Content-Type: application/json' -H 'Authorization: Bearer local' \
          -d "$CUERPO" 2>/dev/null); then
  TEXTO=$(jq -r '.choices[0].message.content // empty' <<<"$RTA")
  TOKENS=$(jq -r '.usage.completion_tokens // 0' <<<"$RTA")
  SEGS=$(( $(date +%s) - INICIO ))
  if [ -n "$TEXTO" ]; then
    ok "contestó en ${SEGS}s: $(tr '\n' ' ' <<<"$TEXTO" | cut -c1-60)"
    [ "$SEGS" -gt 0 ] && [ "$TOKENS" -gt 0 ] && echo "     ~$((TOKENS / SEGS)) tokens/s (incluye la carga del modelo)"
  else
    falla "respuesta vacía: $(cut -c1-200 <<<"$RTA")"
  fi
else
  falla "la consulta falló o superó los 180s"
  echo "     La primera vez el modelo tarda en cargarse. Reintentá."
fi

titulo "4 · Genera embeddings"
if EMB=$(curl -fsS --max-time 60 "$API/v1/embeddings" \
          -H 'Content-Type: application/json' -H 'Authorization: Bearer local' \
          -d "$(jq -n --arg m "$MODELO_EMB" '{model: $m, input: "margen bruto por hectárea"}')" 2>/dev/null); then
  DIM=$(jq -r '.data[0].embedding | length' <<<"$EMB")
  if [ "$DIM" -gt 0 ] 2>/dev/null; then
    ok "vector de $DIM dimensiones"
  else
    falla "embeddings vacíos: $(cut -c1-200 <<<"$EMB")"
  fi
else
  falla "el endpoint de embeddings no respondió"
fi

titulo "Resultado"
if [ "$FALLAS" -eq 0 ]; then
  ok "${NEGRITA}todo en orden${FIN}"
  echo
  exit 0
else
  error "$FALLAS verificación(es) fallaron"
  echo "     Revisá los logs con:  make logs"
  echo
  exit 1
fi
