# ═══════════════════════════════════════════════════════════════════════
# BASE · CONEXIÓN
#
# Una sola cosa importante pasa acá: cada conexión declara a qué
# organización pertenece antes de hacer nada.
#
#     SET app.organizacion = '<uuid>';
#
# Las políticas de Row Level Security de la base leen ese valor. Si nadie lo
# setea, no se ve NADA. Falla cerrado a propósito: preferimos una consulta
# vacía antes que mostrarle a un cliente los lotes de otro.
#
# Hoy hay una sola organización y esto parece burocracia. No lo es: agregar
# aislamiento después obliga a reauditar la aplicación entera.
# ═══════════════════════════════════════════════════════════════════════

import os
from contextlib import contextmanager

import psycopg

from motor.dominio.errores import ErrorDominio

# Se lee del entorno para no tener credenciales en el código ni en el repo.
VARIABLE_ENTORNO = "PLATAFORMA_BASE_URL"
URL_POR_OMISION = "postgresql://plataforma:plataforma@localhost:5432/plataforma"


def url():
    return os.environ.get(VARIABLE_ENTORNO, URL_POR_OMISION)


@contextmanager
def conectar(organizacion_id, autocommit=False):
    """
    Abre una conexión ya ubicada en su organización.

    Se pide el uuid de organización de forma obligatoria: no hay manera de
    abrir una conexión "sin organización" y olvidarse de setearla después.
    """
    if not organizacion_id:
        raise ErrorDominio(
            "Toda conexión tiene que declarar su organización: las políticas de "
            "la base filtran por ese valor y sin él no se ve nada.")

    with psycopg.connect(url(), autocommit=autocommit) as conexion:
        with conexion.cursor() as cur:
            # SET LOCAL no sirve acá: se perdería al terminar la transacción.
            cur.execute("SELECT set_config('app.organizacion', %s, false)",
                        (str(organizacion_id),))
        yield conexion


def verificar_esquema(conexion):
    """
    Comprueba que la base tenga el esquema esperado antes de escribir nada.

    Es barato y evita el error más molesto de todos: procesar media hora y
    fallar al guardar porque faltaba correr una migración.
    """
    faltantes = []
    esperados = ("nucleo", "sensor", "vuelo", "indice", "manejo",
                 "campo", "ganaderia", "auditoria")

    with conexion.cursor() as cur:
        cur.execute("SELECT nspname FROM pg_namespace")
        presentes = {fila[0] for fila in cur.fetchall()}

    for esquema in esperados:
        if esquema not in presentes:
            faltantes.append(esquema)

    if faltantes:
        raise ErrorDominio(
            f"A la base le faltan los esquemas {faltantes}. Corré las migraciones "
            f"de base/: 001_esquema.sql, 002_particiones.sql, 003_rls.sql")

    return True
