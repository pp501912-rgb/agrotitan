#!/usr/bin/env bash
# Hace que el servidor se levante solo al prender la máquina.
#   ./scripts/autoarranque.sh {instalar|desinstalar|estado}
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

UNIDAD=agrotitan-ia.service
RUTA_UNIDAD="/etc/systemd/system/$UNIDAD"
accion="${1:-estado}"

# En macOS no hay systemd: alcanza con que Docker Desktop arranque al
# iniciar sesión, porque los servicios ya tienen restart: unless-stopped.
if [ "$(uname -s)" = "Darwin" ]; then
  titulo "macOS"
  echo "  Acá no hace falta este script: los contenedores ya están definidos"
  echo "  con 'restart: unless-stopped', así que vuelven solos cuando arranca"
  echo "  Docker."
  echo
  echo "  Alcanza con activar, en Docker Desktop:"
  echo "    Settings → General → Start Docker Desktop when you sign in"
  echo
  exit 0
fi

if ! command -v systemctl >/dev/null 2>&1; then
  error "Este sistema no usa systemd; no puedo instalar el arranque automático."
  echo "     Los contenedores igual vuelven solos si el demonio de Docker"
  echo "     arranca al bootear (tienen restart: unless-stopped)."
  exit 1
fi

sudo_si_hace_falta() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi
}

case "$accion" in

  instalar)
    DOCKER_BIN="$(command -v docker)"
    ARCHIVOS="-f $RAIZ/compose.yaml"

    # Si la GPU está utilizable, el arranque automático también la usa.
    if command -v nvidia-smi >/dev/null 2>&1 \
       && docker run --rm --gpus all ollama/ollama:latest nvidia-smi -L >/dev/null 2>&1; then
      ARCHIVOS="$ARCHIVOS -f $RAIZ/compose.gpu.yaml"
      ok "GPU detectada: el arranque automático la va a usar"
    else
      aviso "sin GPU utilizable: el arranque automático va a usar CPU"
    fi

    titulo "Instalando $UNIDAD"
    TMP="$(mktemp)"
    cat > "$TMP" <<UNIT
[Unit]
Description=AgroTitan · servidor de IA local
Documentation=file://$RAIZ/README.md
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$RAIZ
ExecStart=$DOCKER_BIN compose $ARCHIVOS --profile web up -d --wait
ExecStop=$DOCKER_BIN compose $ARCHIVOS --profile web down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
UNIT

    sudo_si_hace_falta install -m 0644 "$TMP" "$RUTA_UNIDAD"
    rm -f "$TMP"
    sudo_si_hace_falta systemctl daemon-reload
    sudo_si_hace_falta systemctl enable --now "$UNIDAD"
    ok "instalado y activado"
    echo
    echo "     El servidor va a levantarse solo en cada arranque."
    echo "     Ver estado:   systemctl status $UNIDAD"
    echo "     Desactivar:   ./scripts/autoarranque.sh desinstalar"
    echo
    ;;

  desinstalar)
    titulo "Quitando $UNIDAD"
    if [ ! -f "$RUTA_UNIDAD" ]; then
      aviso "no estaba instalado"
      exit 0
    fi
    sudo_si_hace_falta systemctl disable --now "$UNIDAD" || true
    sudo_si_hace_falta rm -f "$RUTA_UNIDAD"
    sudo_si_hace_falta systemctl daemon-reload
    ok "quitado (el servidor sigue manejándose a mano con 'make arriba')"
    ;;

  estado)
    titulo "Arranque automático"
    if [ -f "$RUTA_UNIDAD" ]; then
      ok "instalado en $RUTA_UNIDAD"
      systemctl is-enabled "$UNIDAD" >/dev/null 2>&1 \
        && ok "activado (arranca al bootear)" \
        || aviso "instalado pero desactivado"
      systemctl status "$UNIDAD" --no-pager --lines=0 2>/dev/null | sed 's/^/     /' || true
    else
      aviso "no instalado — activalo con:  make autoarranque"
    fi
    ;;

  *)
    error "Acción desconocida: $accion"
    echo "     Usá: instalar | desinstalar | estado"
    exit 1
    ;;
esac
