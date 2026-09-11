#!/usr/bin/env bash
# Verifica si Docker puede darle una GPU NVIDIA a los contenedores.
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

titulo "GPU NVIDIA"

if ! command -v nvidia-smi >/dev/null 2>&1; then
  aviso "No hay nvidia-smi en el host: no se detecta GPU NVIDIA."
  echo "     El servidor va a funcionar igual en CPU (más lento)."
  echo "     Usá 'make arriba', no 'make arriba-gpu'."
  exit 0
fi

ok "GPU detectada en el host:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | sed 's/^/     /'

titulo "Acceso desde Docker"
if docker run --rm --gpus all ollama/ollama:latest nvidia-smi -L >/dev/null 2>&1; then
  ok "Docker puede usar la GPU. Levantá con:  make arriba-gpu"
else
  error "Docker no puede usar la GPU."
  echo "     Falta el NVIDIA Container Toolkit. Instalación:"
  echo "     https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
  exit 1
fi
