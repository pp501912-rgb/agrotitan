# ═══════════════════════════════════════════════════════════════
#  AGROTITAN · SERVIDOR DE IA LOCAL
#  Atajos para no tener que acordarse de los comandos de Docker.
#  `make` sin argumentos muestra la lista.
# ═══════════════════════════════════════════════════════════════

SHELL := /bin/bash
COMPOSE := docker compose
GPU := $(COMPOSE) -f compose.yaml -f compose.gpu.yaml

# Lee MODELO del .env si existe; si no, usa el mismo default que .env.ejemplo.
MODELO ?= $(shell [ -f .env ] && sed -n 's/^MODELO=//p' .env | head -1)
MODELO := $(if $(MODELO),$(MODELO),qwen2.5:7b-instruct)

.DEFAULT_GOAL := ayuda
.PHONY: ayuda instalar arriba arriba-gpu arriba-api abajo reiniciar estado logs \
        probar modelos bajar-modelo listar-modelos borrar-modelo chat actualizar \
        check-gpu autoarranque sin-autoarranque limpiar respaldo

ayuda:  ## Muestra esta ayuda
	@echo ""
	@echo "  AgroTitan · servidor de IA local"
	@echo ""
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""

instalar:  ## Primera vez: verifica requisitos, crea .env y baja los modelos
	@./scripts/instalar.sh

arriba:  ## Levanta el servidor (API + interfaz web), en CPU
	$(COMPOSE) --profile web up -d --wait
	@$(MAKE) --no-print-directory estado

arriba-gpu:  ## Levanta el servidor usando la GPU NVIDIA
	$(GPU) --profile web up -d --wait
	@$(MAKE) --no-print-directory estado

arriba-api:  ## Levanta solo la API, sin interfaz web
	$(COMPOSE) up -d --wait ollama
	@$(MAKE) --no-print-directory estado

abajo:  ## Apaga el servidor (los modelos descargados se conservan)
	$(COMPOSE) --profile web down

reiniciar:  ## Apaga y vuelve a levantar
	@$(MAKE) --no-print-directory abajo
	@$(MAKE) --no-print-directory arriba

estado:  ## Muestra si está vivo, qué modelos hay y qué está cargado en memoria
	@./scripts/estado.sh

logs:  ## Sigue los logs en vivo (Ctrl-C para salir)
	$(COMPOSE) --profile web logs -f --tail=100

probar:  ## Prueba de humo: responde, tiene los modelos y genera embeddings
	@./scripts/probar.sh

modelos:  ## Baja los modelos definidos en .env (chat + embeddings)
	@./scripts/modelos.sh bajar

listar-modelos:  ## Lista los modelos ya descargados
	@./scripts/modelos.sh listar

bajar-modelo:  ## Baja un modelo puntual: make bajar-modelo M=llama3.1:8b
	@./scripts/modelos.sh bajar-uno "$(M)"

borrar-modelo:  ## Borra un modelo: make borrar-modelo M=llama3.1:8b
	@./scripts/modelos.sh borrar "$(M)"

chat:  ## Abre un chat en la terminal con el modelo por defecto
	docker exec -it agrotitan-ollama ollama run "$(MODELO)"

actualizar:  ## Baja las imágenes nuevas y reinicia
	$(COMPOSE) --profile web pull
	@$(MAKE) --no-print-directory arriba

check-gpu:  ## Verifica si Docker puede usar la GPU NVIDIA
	@./scripts/check-gpu.sh

autoarranque:  ## Hace que el servidor se levante solo al prender la máquina
	@./scripts/autoarranque.sh instalar

sin-autoarranque:  ## Desactiva el arranque automático
	@./scripts/autoarranque.sh desinstalar

respaldo:  ## Copia los modelos y los datos de la web a ./respaldos/
	@./scripts/respaldo.sh

limpiar:  ## Borra TODO, modelos incluidos. Pide confirmación.
	@read -r -p "Esto borra los modelos descargados y el historial de chat. ¿Seguro? [escribí BORRAR] " r; \
	 if [ "$$r" = "BORRAR" ]; then $(COMPOSE) --profile web down -v && echo "Listo."; \
	 else echo "Cancelado."; fi
