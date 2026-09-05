#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# VERIFICACIÓN DE LA PERSISTENCIA CONTRA UNA BASE DE VERDAD
#
# Toma el plan de escritura de una corrida completa y lo ejecuta contra
# PostgreSQL. Comprueba lo que ninguna prueba sin base puede comprobar:
# que las columnas existen, que los tipos entran, que las claves foráneas
# cierran, que las filas caen en la partición del año correcto, que
# chk_comparable rechaza lo que tiene que rechazar, y —lo más importante—
# que el aislamiento entre organizaciones SE APLICA de verdad.
#
#     python3 pruebas/verificar_persistencia.py "postgresql://..."
#
# ⚠ SOBRE EL RENDERIZADO CON LITERALES
#   Este arnés convierte los parámetros a literales SQL porque usa psql y
#   no psycopg, que no se puede instalar en el entorno de desarrollo. Es
#   CÓDIGO DE VERIFICACIÓN, no de producción: el motor usa siempre
#   consultas parametrizadas (motor/persistencia.py:ejecutar). No copiar
#   este renderizado a ningún lado.
# ═══════════════════════════════════════════════════════════════════════

import os
import re
import subprocess
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.dominio.recomendacion import Recomendacion          # noqa: E402
from motor.persistencia import plan_de_escritura, resolver     # noqa: E402

_CUADRADO = {"type": "Polygon",
             "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]}


# ── psql ───────────────────────────────────────────────────────────────

def psql(url, sql, tolerar_error=False):
    """Corre SQL y devuelve (exito, salida)."""
    r = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
        capture_output=True, text=True)

    if r.returncode != 0 and not tolerar_error:
        return False, r.stderr.strip()

    return r.returncode == 0, _sin_etiquetas(r.stdout) or r.stderr.strip()


# psql mezcla el valor de un RETURNING con la etiqueta del comando
# ("INSERT 0 1") en la misma salida. Sin sacarla, el uuid devuelto llega
# con la etiqueta pegada y la siguiente operación lo rechaza por sintaxis.
_ETIQUETA = re.compile(
    r"^(INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+|SET|BEGIN|COMMIT)$")


def _sin_etiquetas(salida):
    lineas = [l for l in (salida or "").strip().splitlines()
              if l.strip() and not _ETIQUETA.match(l.strip())]
    return "\n".join(lineas).strip()


def literal(valor):
    """Un parámetro como literal SQL. Solo para este arnés."""
    if valor is None:
        return "NULL"
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, (int, float)):
        return repr(valor)
    return "'" + str(valor).replace("'", "''") + "'"


def render(sql, parametros):
    """Reemplaza los %s en orden por sus literales."""
    restantes = list(parametros)

    def uno(_):
        return literal(restantes.pop(0))

    rendida = re.sub(r"%s", uno, sql)
    if restantes:
        raise AssertionError(
            f"Sobran {len(restantes)} parámetros: la sentencia tiene menos %s "
            f"que valores. Es exactamente el bug que este arnés busca.")
    return rendida


def correr_plan(url, plan):
    """Ejecuta el plan operación por operación. Devuelve (ok, errores)."""
    resultados, errores = {}, []

    for operacion in plan:
        parametros = resolver(operacion.parametros, resultados)
        sql = render(operacion.sql, parametros).strip().rstrip(";")

        exito, salida = psql(url, sql, tolerar_error=True)

        if not exito:
            # Se corta acá: seguir con el plan roto solo produce una cascada
            # de errores que tapan el primero, que es el que importa.
            errores.append((operacion.nombre, salida.splitlines()[0]
                            if salida else "?"))
            return resultados, errores

        if operacion.devuelve_fila and operacion.guarda_como:
            fila = tuple(salida.split("|")) if salida else ()
            resultados[operacion.guarda_como] = fila

    return resultados, errores


# ── el contexto de prueba ──────────────────────────────────────────────

def contexto(organizacion, lote, sha, comparable=True):
    return {
        "organizacion": organizacion, "campo": "La Esperanza", "lote": lote,
        "fecha": "2026-03-15", "comparable": comparable,
        "sha256_entrada": sha, "superficie_ha": 128.5,
        "geo": {"crs": "EPSG:32721", "epsg_utm": 32721, "footprint": _CUADRADO},
        "ortomosaico": {
            "ruta_cog": f"/datos/{lote}/o.tif", "footprint": _CUADRADO,
            "n_bandas": 5, "dtype": "uint16", "escala": 10000,
            "crs": "EPSG:32721", "ancho_px": 900, "alto_px": 700, "sha256": sha},
        "indices": {"NDVI": {
            "ruta_cog": f"/datos/{lote}/ndvi.tif", "escala": 10000,
            "media": 0.71, "desvio": 0.08, "minimo": 0.05, "maximo": 0.93,
            "p5": 0.55, "p95": 0.88}},
        "indices_no_disponibles": {"EVI": "falta la banda «blue»"},
        "zonas": [{"zona": 1, "geometry": _CUADRADO, "superficie_ha": 40.2},
                  {"zona": 2, "geometry": _CUADRADO, "superficie_ha": 88.3}],
        "detalle_zonas": {"k": 2, "resolucion_m": 3.0},
        "prescripcion": {
            1: {"dosis_kg_ha": 0.0, "justificacion": "zona suficiente"},
            2: {"dosis_kg_ha": 60.0, "justificacion": "deficit de nitrogeno"}},
        "recomendaciones": [Recomendacion(
            "Aplicar 60 kg N/ha en la zona 2", "Holland y Schepers (2010)")],
        "duracion_seg": 12.5, "pico_memoria_mb": 380.0,
    }


# ── las comprobaciones ─────────────────────────────────────────────────

def verificar(url):
    fallas = []

    def revisar(titulo, condicion, detalle=""):
        print(f"  {'OK   ' if condicion else 'FALLA'}  {titulo}")
        if not condicion:
            if detalle:
                print(f"          {detalle}")
            fallas.append(titulo)

    print("\n── 1. Un plan completo entra en la base ──")

    vuelo_a = str(uuid.uuid4())
    plan = plan_de_escritura(contexto("Org A", "Lote 1", "a" * 64),
                             ids={"vuelo_id": vuelo_a})
    _, errores = correr_plan(url, plan)

    revisar(f"{len(plan)} operaciones sin error",
            not errores,
            "; ".join(f"{n}: {e}" for n, e in errores[:3]))

    print("\n── 2. Las filas caen en la partición del año ──")

    ok, salida = psql(url, "SELECT tableoid::regclass FROM vuelo.vuelo "
                           f"WHERE id = '{vuelo_a}'")
    revisar("el vuelo de 2026 está en p_vuelo_2026",
            ok and "p_vuelo_2026" in salida, salida)

    ok, salida = psql(url, "SELECT count(*) FROM auditoria.particiones_default_ocupadas "
                           "WHERE filas > 0")
    revisar("ninguna fila cayó en la partición por defecto",
            ok and salida == "0", salida)

    print("\n── 3. Lo que se guardó es lo que se esperaba ──")

    for titulo, consulta, esperado in (
        ("la corrida quedó registrada con versión y hash",
         "SELECT count(*) FROM auditoria.corrida WHERE version_motor IS NOT NULL "
         "AND hash_entrada IS NOT NULL AND resultado = 'ok'", "1"),
        ("el pico de memoria se guardó",
         "SELECT count(*) FROM auditoria.corrida WHERE pico_memoria_mb > 0", "1"),
        ("los percentiles p5 y p95 no quedaron vacíos",
         "SELECT count(*) FROM indice.capa WHERE p5 IS NOT NULL AND p95 IS NOT NULL",
         "1"),
        ("las dos zonas con sus dosis",
         "SELECT count(*) FROM manejo.dosis", "2"),
        ("el índice no disponible quedó en control de calidad",
         "SELECT count(*) FROM vuelo.control_calidad WHERE chequeo = 'indice:EVI'",
         "1"),
        ("la recomendación tiene fuente",
         "SELECT count(*) FROM manejo.recomendacion WHERE fuente <> ''", "1"),
    ):
        ok, salida = psql(url, consulta)
        revisar(titulo, ok and salida == esperado, f"esperaba {esperado}, dio {salida}")

    print("\n── 4. chk_comparable rechaza lo que tiene que rechazar ──")

    # Se fuerza comparable = true SIN calibración: la base tiene que negarse.
    ok, salida = psql(
        url,
        "INSERT INTO vuelo.vuelo (id, organizacion_id, lote_id, fecha, comparable) "
        "SELECT gen_random_uuid(), organizacion_id, lote_id, fecha, true "
        f"FROM vuelo.vuelo WHERE id = '{vuelo_a}'",
        tolerar_error=True)
    revisar("un vuelo comparable sin calibración es rechazado",
            not ok and "chk_comparable" in salida, salida[:120])

    print("\n── 5. AISLAMIENTO ENTRE ORGANIZACIONES (la prueba que faltaba) ──")

    vuelo_b = str(uuid.uuid4())
    plan_b = plan_de_escritura(contexto("Org B", "Lote 9", "b" * 64),
                               ids={"vuelo_id": vuelo_b})
    _, errores_b = correr_plan(url, plan_b)
    revisar("se cargó una segunda organización", not errores_b,
            "; ".join(f"{n}: {e}" for n, e in errores_b[:2]))

    ok, org_a = psql(url, "SELECT id FROM nucleo.organizacion WHERE nombre = 'Org A'")
    ok2, total = psql(url, "SELECT count(*) FROM vuelo.vuelo")
    revisar("como superusuario se ven los vuelos de las dos", ok and ok2 and total == "2",
            f"total = {total}")

    # Ahora como plataforma_app, que NO es superusuario.
    url_app = url_de_aplicacion(url)
    ok, salida = psql(url_app, "SELECT 1")

    if not ok:
        revisar("se puede conectar como plataforma_app", False, salida[:160])
    else:
        ok, salida = psql(
            url_app,
            f"SELECT set_config('app.organizacion', '{org_a}', false); "
            "SELECT count(*) FROM vuelo.vuelo")
        visibles = salida.splitlines()[-1] if salida else "?"
        revisar("con app.organizacion = A, solo se ve 1 vuelo (el de A)",
                ok and visibles == "1", f"vio {visibles}")

        ok, salida = psql(url_app, "SELECT count(*) FROM vuelo.vuelo")
        visibles = salida.strip() if salida else "?"
        revisar("sin declarar organización no se ve NADA (falla cerrado)",
                ok and visibles == "0", f"vio {visibles}")

        ok, salida = psql(url_app, "DELETE FROM vuelo.vuelo", tolerar_error=True)
        revisar("plataforma_app no puede borrar vuelos",
                not ok and "permission denied" in salida.lower(), salida[:100])

    ok, salida = psql(url, "SELECT count(*) FROM auditoria.roles_que_saltean_rls")
    revisar("no quedan roles con login que salteen el aislamiento",
            ok and salida == "0",
            f"hay {salida} rol(es) que saltean RLS: revisar con "
            f"SELECT * FROM auditoria.roles_que_saltean_rls")

    print()
    if fallas:
        print(f"{len(fallas)} comprobación(es) fallaron:")
        for f in fallas:
            print(f"  · {f}")
        return 1

    print("Todas las comprobaciones pasaron.")
    return 0


def url_de_aplicacion(url):
    """La misma base, pero entrando como plataforma_app."""
    if "?" in url:
        base, consulta = url.split("?", 1)
        return f"postgresql://plataforma_app@/{base.rsplit('/', 1)[-1]}?{consulta}"
    return re.sub(r"//[^@/]*@", "//plataforma_app@", url)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(verificar(sys.argv[1]))
