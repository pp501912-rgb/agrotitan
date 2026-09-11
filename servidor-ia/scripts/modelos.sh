#!/usr/bin/env bash
# Gestión de modelos:  modelos.sh {bajar|bajar-uno M|listar|borrar M}
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

accion="${1:-listar}"
arg="${2:-}"

case "$accion" in

  bajar)
    exigir_vivo
    for m in "$(cfg MODELO qwen2.5:7b-instruct)" "$(cfg MODELO_EMBEDDINGS nomic-embed-text)"; do
      [ -n "$m" ] || continue
      titulo "Bajando $m"
      ollama pull "$m"
      ok "$m listo"
    done
    ;;

  bajar-uno)
    exigir_vivo
    if [ -z "$arg" ]; then
      error "Falta el nombre. Ejemplo:  make bajar-modelo M=llama3.1:8b"
      exit 1
    fi
    ollama pull "$arg" && ok "$arg listo"
    ;;

  listar)
    exigir_vivo
    titulo "Modelos descargados"
    ollama list
    ;;

  borrar)
    exigir_vivo
    if [ -z "$arg" ]; then
      error "Falta el nombre. Ejemplo:  make borrar-modelo M=llama3.1:8b"
      exit 1
    fi
    ollama rm "$arg" && ok "$arg borrado"
    ;;

  *)
    error "Acción desconocida: $accion"
    echo "     Usá: bajar | bajar-uno <modelo> | listar | borrar <modelo>"
    exit 1
    ;;
esac
