# ═══════════════════════════════════════════════════════════════════════
# PLATAFORMA MULTIESPECTRAL
#
#   make pruebas       las del dominio: corren sin instalar nada
#   make verificar     todo, incluida la capa ráster (necesita el entorno)
#   make datos         genera el ortomosaico sintético de prueba
#   make sql           valida el SQL contra una base de verdad
#   make persistencia  ejecuta un plan completo contra la base y prueba el
#                      aislamiento entre organizaciones
#   make entorno       arma el entorno conda
# ═══════════════════════════════════════════════════════════════════════

PYTHON ?= python3
BASE_URL ?= postgresql://plataforma:plataforma@localhost:5432/plataforma
ORTO ?= datos/ejemplo/orto.tif

.PHONY: ayuda pruebas verificar datos sql persistencia entorno esquema limpiar

ayuda:
	@grep -E '^#   make' $(MAKEFILE_LIST) | sed 's/^#   //'

# Solo el dominio. No necesita numpy, ni rasterio, ni base de datos: corre en
# cualquier máquina con Python. Es lo que hay que poder ejecutar siempre.
pruebas:
	$(PYTHON) -m unittest discover -s pruebas -t . -v

# Todo. Las pruebas de la capa ráster se saltean solas si falta el entorno,
# así que este comando nunca falla "por no tener nada instalado": falla solo
# si algo está realmente mal.
verificar: datos
	$(PYTHON) -m unittest discover -s pruebas -t . -v
	$(PYTHON) -m motor verificar-entorno

datos:
	@test -f $(ORTO) || $(PYTHON) datos/generar_sintetico.py $(ORTO)

# PREPARE de cada sentencia contra PostgreSQL: valida sintaxis, nombres de
# tabla, nombres de columna y parámetros, sin ejecutar ni tocar un dato.
sql:
	$(PYTHON) pruebas/verificar_sql.py "$(BASE_URL)"

# Ejecuta un plan de escritura completo contra la base y comprueba lo que
# ninguna prueba sin base puede: particiones, restricciones y, sobre todo,
# que el aislamiento entre organizaciones SE APLIQUE de verdad.
persistencia:
	$(PYTHON) pruebas/verificar_persistencia.py "$(BASE_URL)"

esquema:
	psql "$(BASE_URL)" -v ON_ERROR_STOP=1 -f base/001_esquema.sql
	psql "$(BASE_URL)" -v ON_ERROR_STOP=1 -f base/002_particiones.sql
	psql "$(BASE_URL)" -v ON_ERROR_STOP=1 -f base/003_rls.sql
	psql "$(BASE_URL)" -v ON_ERROR_STOP=1 -f base/004_rol_aplicacion.sql
	psql "$(BASE_URL)" -v ON_ERROR_STOP=1 -f base/005_claves_naturales.sql
	@echo "Esquema creado. Comprobaciones:"
	psql "$(BASE_URL)" -c "SELECT count(*) AS tablas_con_rls FROM pg_class WHERE relrowsecurity"
	@echo "Si la próxima consulta devuelve filas, hay roles que saltean el aislamiento:"
	psql "$(BASE_URL)" -c "SELECT * FROM auditoria.roles_que_saltean_rls"

entorno:
	conda env create -f entorno.yml

limpiar:
	rm -rf datos/ejemplo
	find . -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
