# ═══════════════════════════════════════════════════════════════════════
# RECONSTRUIR · COBRAR EL SEGURO DE VIDA
#
# Recorre las carpetas de datos, lee los manifiestos y vuelve a armar las
# filas de la base. Es lo que hace verdadera la frase del LEEME: "si la base
# se pierde, un script la repuebla leyendo los manifiestos".
#
# Un archivo de respaldo que nadie probó restaurar no es un respaldo. Por
# eso planificar() es puro y se prueba, y aplicar() es tan chico que no
# tiene dónde esconder un error.
#
# Es IDEMPOTENTE: correrlo dos veces no duplica nada. Los vuelos ya
# presentes se reconocen por el sha256 del ortomosaico —la restricción
# ortomosaico_sha_unico— y se saltean.
# ═══════════════════════════════════════════════════════════════════════

from motor.dominio import manifiesto as manifiestos
from motor.persistencia import plan_de_escritura


class Hallazgo:
    """Un vuelo encontrado en el disco, y qué se puede hacer con él."""

    __slots__ = ("directorio", "manifiesto", "estado", "motivo", "plan")

    def __init__(self, directorio, manifiesto, estado, motivo="", plan=None):
        self.directorio = directorio
        self.manifiesto = manifiesto
        self.estado = estado            # 'listo' | 'incompleto' | 'ya_estaba'
        self.motivo = motivo
        self.plan = plan

    def __repr__(self):
        return f"Hallazgo({self.manifiesto.lote!r}, {self.estado})"


def planificar(raiz, hashes_presentes=()):
    """
    Recorre `raiz` y arma el plan de escritura de cada vuelo.

    `hashes_presentes` son los sha256 que la base ya tiene: los vuelos que
    coinciden se marcan 'ya_estaba' y no se vuelven a escribir. Se pasa como
    argumento —en vez de consultarlo acá adentro— para que esta función siga
    siendo pura y probable sin base de datos.

    Devuelve la lista de Hallazgo, en orden de carpeta.
    """
    presentes = set(hashes_presentes)
    hallazgos = []

    for directorio, manifiesto in manifiestos.recorrer(raiz):
        sha = (manifiesto.parametros or {}).get("sha256_entrada")

        if sha and sha in presentes:
            hallazgos.append(Hallazgo(
                directorio, manifiesto, "ya_estaba",
                f"el ortomosaico {sha[:12]}… ya está en la base"))
            continue

        if not manifiesto.reconstruible:
            faltan = []
            if not manifiesto.vuelo_id:
                faltan.append("vuelo_id")
            if not manifiesto.geo.get("footprint"):
                faltan.append("geo.footprint")
            hallazgos.append(Hallazgo(
                directorio, manifiesto, "incompleto",
                f"al manifiesto le falta {' y '.join(faltan)}: describe el vuelo "
                f"pero no alcanza para rehacer las filas"))
            continue

        hallazgos.append(Hallazgo(
            directorio, manifiesto, "listo", "",
            plan_de_escritura(_contexto(manifiesto),
                              ids={"vuelo_id": manifiesto.vuelo_id})))

    return hallazgos


def _contexto(manifiesto):
    """
    Del manifiesto al contexto que espera plan_de_escritura.

    Lo que se reconstruye son las filas de identidad y de auditoría, no los
    resultados: las capas, las zonas y las recomendaciones se recalculan
    volviendo a procesar el vuelo, que es más honesto que reconstruir de
    memoria unos números que ya no se pueden verificar.
    """
    return {
        "organizacion": manifiesto.organizacion,
        "campo": manifiesto.campo,
        "lote": manifiesto.lote,
        "fecha": manifiesto.fecha,
        "comparable": manifiesto.comparable,
        "geo": manifiesto.geo,
        "sha256_entrada": (manifiesto.parametros or {}).get("sha256_entrada"),
        "parametros": dict(manifiesto.parametros or {},
                           reconstruido_desde=manifiesto.creado),
        "resultado": "ok",
        "mensaje": f"reconstruido desde el manifiesto de {manifiesto.creado}",
    }


def aplicar(hallazgos, cursor):
    """
    Ejecuta los planes de los hallazgos listos. Necesita psycopg.

    Devuelve el recuento por estado. No hace nada más: todas las decisiones
    ya están tomadas en planificar().
    """
    from motor.persistencia import ejecutar

    cuenta = {"listo": 0, "ya_estaba": 0, "incompleto": 0, "error": 0}

    for hallazgo in hallazgos:
        if hallazgo.estado != "listo":
            cuenta[hallazgo.estado] += 1
            continue

        try:
            ejecutar(hallazgo.plan, cursor)
            cuenta["listo"] += 1
        except Exception as e:                       # noqa: BLE001
            hallazgo.estado = "error"
            hallazgo.motivo = str(e)
            cuenta["error"] += 1

    return cuenta


def informe(hallazgos):
    """Texto para la consola: qué se encontró y qué hay que arreglar a mano."""
    lineas = []
    por_estado = {}

    for h in hallazgos:
        por_estado.setdefault(h.estado, []).append(h)

    for estado in ("listo", "ya_estaba", "incompleto", "error"):
        grupo = por_estado.get(estado, [])
        if not grupo:
            continue
        lineas.append(f"\n{estado.upper()} ({len(grupo)}):")
        for h in grupo:
            detalle = f" — {h.motivo}" if h.motivo else ""
            lineas.append(f"  {h.manifiesto.lote} · {h.manifiesto.fecha}{detalle}")

    # Los lotes creados desde la huella del vuelo NO son el lote relevado.
    creados = [h for h in hallazgos if h.estado == "listo"]
    if creados:
        lineas.append(
            "\n⚠ Los lotes que no existían se crean con la HUELLA DEL VUELO como "
            "geometría provisoria.\n  No es el lote relevado: es lo que el vuelo "
            "cubrió. Conviene reemplazarla por el polígono real.")

    return "\n".join(lineas)
