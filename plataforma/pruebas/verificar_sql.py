#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# VERIFICACIÓN DEL SQL CONTRA UNA BASE DE VERDAD
#
# Toma cada sentencia de motor/base/repositorio.py y se la da a PostgreSQL
# con PREPARE. El servidor la analiza entera —sintaxis, nombres de tabla,
# nombres de columna, cantidad y tipo de parámetros— sin ejecutar nada ni
# tocar un solo dato.
#
# Es la forma más barata de no descubrir un nombre de columna mal escrito
# después de media hora de procesamiento.
#
#     python3 pruebas/verificar_sql.py "postgresql://usuario@host/base"
#
# No necesita psycopg: usa psql, que viene con PostgreSQL.
# ═══════════════════════════════════════════════════════════════════════

import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.base.repositorio import SENTENCIAS       # noqa: E402


def a_numerados(sql):
    """PREPARE usa $1, $2...; psycopg usa %s. Se traduce para verificar."""
    contador = [0]

    def reemplazo(_):
        contador[0] += 1
        return f"${contador[0]}"

    return re.sub(r"%s", reemplazo, sql)


def verificar(url):
    fallas = []

    for nombre, sql in sorted(SENTENCIAS.items()):
        preparada = f"PREPARE p_{nombre} AS {a_numerados(sql).strip().rstrip(';')};"

        resultado = subprocess.run(
            ["psql", url, "-v", "ON_ERROR_STOP=1", "-q", "-c", preparada],
            capture_output=True, text=True)

        if resultado.returncode == 0:
            print(f"  OK      {nombre}")
        else:
            error = resultado.stderr.strip().splitlines()
            print(f"  FALLA   {nombre}")
            for linea in error[:3]:
                print(f"          {linea}")
            fallas.append(nombre)

    print()
    print(f"{len(SENTENCIAS) - len(fallas)}/{len(SENTENCIAS)} sentencias válidas")
    return 1 if fallas else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        print("Falta la URL de la base.")
        raise SystemExit(2)
    raise SystemExit(verificar(sys.argv[1]))
