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
import sys
from contextlib import contextmanager

import psycopg

from motor.dominio.errores import ErrorDominio

# Se lee del entorno para no tener credenciales en el código ni en el repo.
VARIABLE_ENTORNO = "PLATAFORMA_BASE_URL"
# El usuario por omisión es plataforma_app, NO el dueño de la base: Row
# Level Security no se aplica a un superusuario, así que conectarse con uno
# desactiva en silencio todo el aislamiento entre clientes. Ver
# base/004_rol_aplicacion.sql.
URL_POR_OMISION = ("postgresql://plataforma_app:cambiar_en_produccion"
                   "@localhost:5432/plataforma")


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

        advertir_si_saltea_rls(conexion)
        yield conexion


def advertir_si_saltea_rls(conexion):
    """
    Avisa fuerte si la conexión puede saltear el aislamiento entre clientes.

    Row Level Security NO SE APLICA a un superusuario ni a un rol con
    BYPASSRLS. Las políticas pueden estar perfectas y no filtrar nada. Es un
    problema que no da ningún síntoma —todo anda, y de más— hasta el día que
    un cliente ve los lotes de otro.

    No se lanza excepción: hay tareas legítimas de administración que se
    hacen como superusuario. Pero no pasa en silencio.
    """
    with conexion.cursor() as cur:
        cur.execute("""
            SELECT current_user, rolsuper, rolbypassrls
              FROM pg_roles WHERE rolname = current_user
        """)
        fila = cur.fetchone()

    if not fila:
        return False

    usuario, es_super, saltea = fila
    if es_super or saltea:
        print(
            f"\n  ⚠ ATENCIÓN: conectado como «{usuario}», que "
            f"{'es superusuario' if es_super else 'tiene BYPASSRLS'}.\n"
            f"    Las políticas de aislamiento por organización NO SE APLICAN "
            f"a este usuario:\n"
            f"    esta conexión ve los datos de TODOS los clientes.\n"
            f"    Para operar normalmente, conectarse como plataforma_app "
            f"(ver base/004_rol_aplicacion.sql).\n",
            file=sys.stderr)
        return True

    return False


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
