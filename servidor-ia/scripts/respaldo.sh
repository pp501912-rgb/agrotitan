#!/usr/bin/env bash
# Copia los volúmenes (modelos e historial de la web) a ./respaldos/.
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

FECHA=$(date +%Y-%m-%d)
DESTINO="respaldos/$FECHA"
mkdir -p "$DESTINO"

copiar() {
  local volumen="$1" archivo="$2"
  if ! docker volume inspect "$volumen" >/dev/null 2>&1; then
    aviso "el volumen $volumen no existe todavía, lo salteo"
    return
  fi
  docker run --rm \
    -v "$volumen":/origen:ro \
    -v "$(pwd)/$DESTINO":/destino \
    alpine:3 tar czf "/destino/$archivo" -C /origen .
  ok "$archivo ($(du -h "$DESTINO/$archivo" | cut -f1))"
}

titulo "Respaldo en $DESTINO"
copiar agrotitan-ia_modelos modelos.tar.gz
copiar agrotitan-ia_web     web.tar.gz

echo
echo "     Para restaurar un volumen:"
echo "       docker run --rm -v agrotitan-ia_modelos:/destino \\"
echo "         -v \"\$(pwd)/$DESTINO\":/origen alpine:3 \\"
echo "         tar xzf /origen/modelos.tar.gz -C /destino"
echo
