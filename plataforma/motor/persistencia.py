# ═══════════════════════════════════════════════════════════════════════
# PERSISTENCIA · DE UNA CORRIDA A LA BASE
#
# Misma separación que en el resto del motor: la parte que decide es pura,
# la que toca el mundo es delgada.
#
#   plan_de_escritura(...)  arma la lista de operaciones. Puro: decide qué
#                           se escribe, en qué orden y qué depende de qué.
#                           SE PRUEBA SIN BASE DE DATOS.
#
#   ejecutar(plan, cursor)  recorre la lista y ejecuta. Sin decisiones.
#
# El problema real que resuelve el plan es el de las dependencias: la capa
# de índice necesita el id del ortomosaico, que recién existe después de
# insertarlo; la dosis necesita el id de la zona. En vez de encadenar
# llamadas —que obliga a tener la base para probar cualquier cosa—, una
# operación puede referirse al resultado de otra con Referencia(), y
# resolver() las cambia por valores en el momento de ejecutar.
# ═══════════════════════════════════════════════════════════════════════

import json

from motor.base.repositorio import SENTENCIAS
from motor.dominio.errores import ErrorDominio
from motor.version import VERSION


class Referencia:
    """
    Marcador: "acá va lo que devolvió la operación guardada como `clave`".

    `indice` sirve cuando la operación devuelve una fila de varias columnas,
    como abrir_corrida, que devuelve (id, fecha).
    """

    __slots__ = ("clave", "indice")

    def __init__(self, clave, indice=None):
        self.clave = clave
        self.indice = indice

    def __repr__(self):
        if self.indice is None:
            return f"Referencia({self.clave!r})"
        return f"Referencia({self.clave!r}, {self.indice})"

    def __eq__(self, otro):
        return (isinstance(otro, Referencia) and self.clave == otro.clave
                and self.indice == otro.indice)


class Operacion:
    """Una escritura: qué sentencia, con qué parámetros, y qué deja atrás."""

    __slots__ = ("nombre", "parametros", "guarda_como", "devuelve_fila")

    def __init__(self, nombre, parametros, guarda_como=None, devuelve_fila=False):
        if nombre not in SENTENCIAS:
            raise ErrorDominio(
                f"«{nombre}» no está en SENTENCIAS. Las sentencias viven todas "
                f"en motor/base/repositorio.py, en un solo lugar y a propósito.")

        self.nombre = nombre
        self.parametros = tuple(parametros)
        self.guarda_como = guarda_como
        self.devuelve_fila = devuelve_fila

    @property
    def sql(self):
        return SENTENCIAS[self.nombre]

    def __repr__(self):
        return f"Operacion({self.nombre!r}, guarda_como={self.guarda_como!r})"


def resolver(parametros, resultados):
    """
    Cambia las Referencia por los valores que ya devolvieron otras operaciones.

    Es puro y es donde puede esconderse un error feo —usar un id antes de
    que exista—, así que se prueba aparte.
    """
    salida = []

    for p in parametros:
        if not isinstance(p, Referencia):
            salida.append(p)
            continue

        if p.clave not in resultados:
            raise ErrorDominio(
                f"La operación necesita el resultado de «{p.clave}», que todavía "
                f"no se ejecutó. Está mal el orden del plan.")

        valor = resultados[p.clave]
        salida.append(valor if p.indice is None else valor[p.indice])

    return tuple(salida)


def _js(valor):
    """
    Un dict como texto JSON para una columna jsonb.

    Devuelve '{}' y NO None cuando no hay nada. Las tres columnas jsonb que
    el motor escribe —auditoria.corrida.parametros, manejo.zona.parametros y
    manejo.recomendacion.supuestos— son NOT NULL con DEFAULT '{}', y el
    DEFAULT no se aplica cuando se pasa NULL explícito: se pasa NULL y el
    INSERT rebota.

    Es un bug que ninguna prueba sin base podía encontrar, porque del lado
    de Python un None es perfectamente válido. Lo encontró el arnés que
    ejecuta el plan contra PostgreSQL de verdad.
    """
    return json.dumps(valor if valor is not None else {}, ensure_ascii=False)


# ═══════════════════════════════════════════════════════════════════════
# EL PLAN
# ═══════════════════════════════════════════════════════════════════════

def plan_de_escritura(contexto, ids=None):
    """
    Arma el plan completo de una corrida.

    `contexto` es el que produce canalizacion.procesar. `ids` trae los
    identificadores que ya se conocen (organizacion_id, lote_id, vuelo_id);
    cuando faltan, el plan los resuelve desde los nombres con las
    operaciones de clave natural, que es el camino de la reconstrucción.
    """
    ids = dict(ids or {})
    plan = []

    fecha = contexto["fecha"]
    vuelo_id = ids.get("vuelo_id")

    # ── Identidad: nombres → uuids ─────────────────────────────────────
    if "organizacion_id" in ids:
        organizacion = ids["organizacion_id"]
    else:
        plan.append(Operacion(
            "upsert_organizacion",
            (contexto.get("organizacion", "sin-organizacion"),
             contexto.get("pais", "AR")),
            guarda_como="organizacion_id", devuelve_fila=True))
        organizacion = Referencia("organizacion_id", 0)

    if "lote_id" in ids:
        lote = ids["lote_id"]
    else:
        geo = contexto.get("geo") or {}
        if not geo.get("footprint"):
            raise ErrorDominio(
                "Para crear el lote hace falta la huella del vuelo, y el contexto "
                "no la trae. Sin geometría no se puede insertar un lote: revisá "
                "que el manifiesto tenga el bloque «geo».")

        plan.append(Operacion(
            "upsert_campo",
            (organizacion, contexto.get("campo", "sin-campo"),
             contexto.get("pais", "AR"), geo.get("epsg_utm")),
            guarda_como="campo_id", devuelve_fila=True))

        plan.append(Operacion(
            "upsert_lote",
            (organizacion, Referencia("campo_id", 0),
             contexto.get("lote", "sin-lote"), json.dumps(geo["footprint"])),
            guarda_como="lote_id", devuelve_fila=True))
        lote = Referencia("lote_id", 0)

    # ── Auditoría: se abre primero y se cierra al final ────────────────
    plan.append(Operacion(
        "abrir_corrida",
        (organizacion, vuelo_id, fecha, fecha, VERSION,
         _js(contexto.get("parametros")), contexto.get("sha256_entrada")),
        guarda_como="corrida", devuelve_fila=True))

    # ── El vuelo ───────────────────────────────────────────────────────
    if vuelo_id is None:
        raise ErrorDominio(
            "El plan necesita un vuelo_id: se genera antes de procesar, para "
            "que la carpeta en disco y la fila en la base compartan el mismo "
            "identificador.")

    plan.append(Operacion("insertar_vuelo", (
        vuelo_id, organizacion, lote, fecha,
        contexto.get("hora_inicio"), ids.get("camara_id"), ids.get("calibracion_id"),
        contexto.get("altura_m"), contexto.get("solape_frontal"),
        contexto.get("solape_lateral"), contexto.get("gsd_cm"),
        contexto.get("nubosidad"), contexto.get("angulo_solar_grados"),
        contexto.get("operador"),
        # La base tiene chk_comparable: si esto viniera en true sin
        # calibracion_id, el INSERT se rechaza. Son dos redes para lo mismo.
        bool(contexto.get("comparable")) and ids.get("calibracion_id") is not None,
        "procesado")))

    # ── El ortomosaico ─────────────────────────────────────────────────
    orto = contexto.get("ortomosaico")
    if orto:
        plan.append(Operacion("insertar_ortomosaico", (
            organizacion, vuelo_id, fecha, orto["ruta_cog"],
            json.dumps(orto["footprint"]), orto["n_bandas"], orto["dtype"],
            orto["escala"], orto["crs"], orto["ancho_px"], orto["alto_px"],
            orto["sha256"]), guarda_como="ortomosaico_id", devuelve_fila=True))

    # ── Las capas de índice ────────────────────────────────────────────
    for nombre, capa in sorted((contexto.get("indices") or {}).items()):
        plan.append(Operacion("insertar_capa", (
            organizacion, Referencia("ortomosaico_id", 0), fecha, nombre,
            capa["ruta_cog"], capa["escala"], capa.get("minimo"),
            capa.get("maximo"), capa.get("media"), capa.get("desvio"),
            capa.get("p5"), capa.get("p95")),
            guarda_como=f"capa_{nombre}", devuelve_fila=True))

    # ── Lo que la cámara no permitió calcular ──────────────────────────
    # Va a control_calidad, no a un log: dentro de dos campañas alguien va a
    # preguntar por qué este vuelo no tiene EVI.
    for nombre, motivo in sorted((contexto.get("indices_no_disponibles") or {}).items()):
        plan.append(Operacion("insertar_control_calidad", (
            organizacion, vuelo_id, fecha, f"indice:{nombre}", False, motivo)))

    if not contexto.get("comparable"):
        plan.append(Operacion("insertar_control_calidad", (
            organizacion, vuelo_id, fecha, "calibracion_radiometrica", False,
            "Vuelo sin panel ni DLS: los valores son números digitales, no "
            "reflectancia. No entra en ninguna serie temporal.")))

    # ── Zonas ──────────────────────────────────────────────────────────
    detalle = contexto.get("detalle_zonas") or {}
    for poligono in contexto.get("zonas") or []:
        plan.append(Operacion("insertar_zona", (
            organizacion, vuelo_id, fecha, poligono["zona"],
            json.dumps(poligono["geometry"]), poligono["superficie_ha"],
            detalle.get("metodo", "kmeans"), detalle.get("k", 0), _js(detalle)),
            guarda_como=f"zona_{poligono['zona']}", devuelve_fila=True))

    # ── Prescripción y dosis ───────────────────────────────────────────
    prescripcion = contexto.get("prescripcion")
    if prescripcion:
        plan.append(Operacion("insertar_prescripcion", (
            organizacion, vuelo_id, fecha,
            contexto.get("insumo", "urea"), contexto.get("unidad", "kg/ha"),
            contexto.get("regla_id", "suficiencia_ndre"), VERSION,
            ids.get("usuario_id")),
            guarda_como="prescripcion_id", devuelve_fila=True))

        for zona, datos in sorted(prescripcion.items()):
            plan.append(Operacion("insertar_dosis", (
                Referencia("prescripcion_id", 0), Referencia(f"zona_{zona}", 0),
                datos["dosis_kg_ha"], datos["justificacion"])))

    # ── Recomendaciones ────────────────────────────────────────────────
    for r in contexto.get("recomendaciones") or []:
        # El constructor de Recomendacion ya exige fuente, así que una sin
        # fuente no puede existir. Se verifica igual: es barato, y es la
        # regla que más caro sale si algún día se rompe.
        if not getattr(r, "fuente", None):
            raise ErrorDominio(
                f"Una recomendación llegó sin fuente al plan de escritura: "
                f"«{getattr(r, 'texto', '')[:60]}». No se guarda.")

        plan.append(Operacion("insertar_recomendacion", (
            organizacion, vuelo_id, fecha, r.texto, r.umbral_aplicado,
            _js(r.supuestos), r.fuente, r.version_motor)))

    # ── Biomasa ────────────────────────────────────────────────────────
    calibracion = contexto.get("calibracion_biomasa")
    if calibracion:
        plan.append(Operacion("insertar_calibracion_biomasa", (
            organizacion, vuelo_id, fecha, calibracion["indice"],
            calibracion.get("modelo", "lineal"), calibracion["pendiente"],
            calibracion["ordenada"], calibracion["r2"],
            calibracion["n_muestras"], calibracion["origen"]),
            guarda_como="calibracion_biomasa_id", devuelve_fila=True))

    # ── Cierre de la auditoría ─────────────────────────────────────────
    plan.append(Operacion("cerrar_corrida", (
        contexto.get("resultado", "ok"), contexto.get("duracion_seg"),
        contexto.get("pico_memoria_mb"), contexto.get("mensaje"),
        Referencia("corrida", 0), Referencia("corrida", 1))))

    return plan


def plan_de_error(contexto, ids):
    """
    El plan mínimo de una corrida que falló: abrirla y cerrarla con el error.

    No escribe ningún resultado porque no hay ninguno en el que confiar. Lo
    que sí deja es la constancia de que se intentó, cuándo, con qué versión
    y por qué se cayó.
    """
    fecha = contexto["fecha"]

    return [
        Operacion("abrir_corrida",
                  (ids["organizacion_id"], ids.get("vuelo_id"), fecha, fecha,
                   VERSION, _js(contexto.get("parametros")),
                   contexto.get("sha256_entrada")),
                  guarda_como="corrida", devuelve_fila=True),
        Operacion("cerrar_corrida",
                  ("error", contexto.get("duracion_seg"),
                   contexto.get("pico_memoria_mb"), contexto.get("mensaje"),
                   Referencia("corrida", 0), Referencia("corrida", 1))),
    ]


# ═══════════════════════════════════════════════════════════════════════
# LA EJECUCIÓN
# ═══════════════════════════════════════════════════════════════════════

def ejecutar(plan, cursor):
    """
    Recorre el plan y lo ejecuta. Sin decisiones: todas están en el plan.

    Devuelve el diccionario de resultados, por si quien llama necesita algún
    id. Necesita psycopg, así que es lo único de este archivo que no se
    prueba sin base.
    """
    resultados = {}

    for operacion in plan:
        parametros = resolver(operacion.parametros, resultados)
        cursor.execute(operacion.sql, parametros)

        if operacion.devuelve_fila and operacion.guarda_como:
            resultados[operacion.guarda_como] = cursor.fetchone()

    return resultados


def resumen(plan):
    """Qué va a escribir el plan, para poder mostrarlo antes de ejecutarlo."""
    cuenta = {}
    for operacion in plan:
        cuenta[operacion.nombre] = cuenta.get(operacion.nombre, 0) + 1
    return dict(sorted(cuenta.items()))
