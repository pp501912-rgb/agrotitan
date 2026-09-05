# ═══════════════════════════════════════════════════════════════════════
# BASE · REPOSITORIO
#
# Todo el SQL del motor, en un solo archivo y como constantes con nombre.
#
# Están sueltas y no escondidas dentro de funciones por una razón práctica:
# así se pueden extraer y validar contra un PostgreSQL de verdad sin
# ejecutar el motor. Eso es lo que hace pruebas/verificar_sql.py, y es la
# única forma de comprobar que los nombres de columna existen sin tener que
# instalar psycopg.
#
# Sin ORM, a propósito. El SQL de este proyecto es simple y se lee mejor así.
# ═══════════════════════════════════════════════════════════════════════

import json

# ── Sentencias ─────────────────────────────────────────────────────────
# La clave es el nombre; el valor, el SQL con marcadores %s de psycopg.

SENTENCIAS = {

    "insertar_vuelo": """
        INSERT INTO vuelo.vuelo
            (id, organizacion_id, lote_id, fecha, hora_inicio, camara_id,
             calibracion_id, altura_m, solape_frontal, solape_lateral, gsd_cm,
             nubosidad, angulo_solar_grados, operador, comparable, estado)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """,

    "insertar_ortomosaico": """
        INSERT INTO vuelo.ortomosaico
            (organizacion_id, vuelo_id, vuelo_fecha, ruta_cog, footprint,
             n_bandas, dtype, escala, crs, ancho_px, alto_px, sha256)
        VALUES (%s, %s, %s, %s, ST_GeomFromGeoJSON(%s), %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """,

    "insertar_control_calidad": """
        INSERT INTO vuelo.control_calidad
            (organizacion_id, vuelo_id, vuelo_fecha, chequeo, paso, motivo)
        VALUES (%s, %s, %s, %s, %s, %s)
    """,

    "insertar_capa": """
        INSERT INTO indice.capa
            (organizacion_id, ortomosaico_id, fecha, indice, ruta_cog, escala,
             minimo, maximo, media, desvio, p5, p95)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """,

    "insertar_zona": """
        INSERT INTO manejo.zona
            (organizacion_id, vuelo_id, vuelo_fecha, numero, geom,
             superficie_ha, metodo, k, parametros)
        VALUES (%s, %s, %s, %s,
                ST_Multi(ST_GeomFromGeoJSON(%s)), %s, %s, %s, %s)
        RETURNING id
    """,

    "insertar_estadistica_zonal": """
        INSERT INTO indice.estadistica_zonal
            (capa_id, capa_fecha, zona_id, n_px, media, desvio, mediana)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """,

    # ── Claves naturales ───────────────────────────────────────────────
    # El manifiesto guarda nombres, no uuids: estas sentencias los traducen
    # a identificadores, creando lo que falte. Son lo que hace posible
    # reconstruir la base desde las carpetas.

    "upsert_organizacion": """
        INSERT INTO nucleo.organizacion (nombre, pais)
        VALUES (%s, %s)
        ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
        RETURNING id
    """,

    "upsert_campo": """
        INSERT INTO nucleo.campo (organizacion_id, nombre, pais, epsg_utm)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (organizacion_id, nombre) DO UPDATE SET epsg_utm = EXCLUDED.epsg_utm
        RETURNING id
    """,

    # El lote se crea con la huella del vuelo como geometría PROVISORIA
    # cuando todavía no existe. No es el lote relevado: es lo que el vuelo
    # cubrió. Queda marcado en el aviso de reconstrucción para que alguien
    # lo reemplace por el polígono de verdad.
    "upsert_lote": """
        INSERT INTO nucleo.lote (organizacion_id, campo_id, nombre, geom)
        VALUES (%s, %s, %s, ST_Multi(ST_GeomFromGeoJSON(%s)))
        ON CONFLICT (campo_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre
        RETURNING id
    """,

    "ortomosaico_por_hash": """
        SELECT o.id, o.vuelo_id, o.vuelo_fecha
          FROM vuelo.ortomosaico o
         WHERE o.organizacion_id = %s AND o.sha256 = %s
    """,

    "insertar_prescripcion": """
        INSERT INTO manejo.prescripcion
            (organizacion_id, vuelo_id, vuelo_fecha, insumo, unidad,
             regla_id, version_motor, creada_por)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """,

    "insertar_dosis": """
        INSERT INTO manejo.dosis (prescripcion_id, zona_id, dosis, justificacion)
        VALUES (%s, %s, %s, %s)
    """,

    "insertar_recomendacion": """
        INSERT INTO manejo.recomendacion
            (organizacion_id, vuelo_id, vuelo_fecha, texto, umbral_aplicado,
             supuestos, fuente, version_motor)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """,

    "insertar_calibracion_biomasa": """
        INSERT INTO ganaderia.calibracion_biomasa
            (organizacion_id, vuelo_id, vuelo_fecha, indice, modelo,
             pendiente, ordenada, r2, n_muestras, origen)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """,

    "insertar_disponibilidad": """
        INSERT INTO ganaderia.disponibilidad
            (organizacion_id, potrero_id, calibracion_id, fecha,
             kg_ms_ha, kg_ms_total)
        VALUES (%s, %s, %s, %s, %s, %s)
    """,

    "abrir_corrida": """
        INSERT INTO auditoria.corrida
            (organizacion_id, vuelo_id, vuelo_fecha, fecha, version_motor,
             parametros, hash_entrada)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, fecha
    """,

    "cerrar_corrida": """
        UPDATE auditoria.corrida
           SET resultado = %s, duracion_seg = %s, pico_memoria_mb = %s, mensaje = %s
         WHERE id = %s AND fecha = %s
    """,

    # La ÚNICA consulta legítima de evolución en el tiempo: la vista ya filtra
    # los vuelos no comparables. Consultar indice.capa directamente para armar
    # una serie es el error que esta vista existe para evitar.
    "serie_temporal": """
        SELECT fecha, indice, media, p5, p95, metodo_calibracion
          FROM indice.serie_comparable
         WHERE lote_id = %s AND indice = %s
         ORDER BY fecha
    """,

    "vuelos_del_lote": """
        SELECT id, fecha, comparable, estado
          FROM vuelo.vuelo
         WHERE lote_id = %s
         ORDER BY fecha DESC
    """,

    "ndre_de_franja_referencia": """
        SELECT f.id, f.fecha_aplicacion, f.dosis_n_kg_ha, f.cultivo
          FROM campo.franja_referencia_n f
         WHERE f.lote_id = %s
           AND f.fecha_aplicacion <= %s
         ORDER BY f.fecha_aplicacion DESC
         LIMIT 1
    """,

    "particiones_default_ocupadas": """
        SELECT tabla, filas FROM auditoria.particiones_default_ocupadas
         WHERE filas > 0
    """,
}


# ── Funciones ──────────────────────────────────────────────────────────

def _js(valor):
    """jsonb quiere texto JSON, no un dict de Python."""
    return json.dumps(valor, ensure_ascii=False) if valor is not None else None


def abrir_corrida(cur, organizacion_id, vuelo_id, vuelo_fecha, fecha,
                  version_motor, parametros, hash_entrada):
    cur.execute(SENTENCIAS["abrir_corrida"],
                (organizacion_id, vuelo_id, vuelo_fecha, fecha, version_motor,
                 _js(parametros), hash_entrada))
    return cur.fetchone()


def cerrar_corrida(cur, corrida, resultado, duracion_seg, pico_memoria_mb,
                   mensaje=None):
    corrida_id, corrida_fecha = corrida
    cur.execute(SENTENCIAS["cerrar_corrida"],
                (resultado, duracion_seg, pico_memoria_mb, mensaje,
                 corrida_id, corrida_fecha))


def guardar_ortomosaico(cur, organizacion_id, vuelo_id, vuelo_fecha, datos):
    cur.execute(SENTENCIAS["insertar_ortomosaico"], (
        organizacion_id, vuelo_id, vuelo_fecha, datos["ruta_cog"],
        json.dumps(datos["footprint"]), datos["n_bandas"], datos["dtype"],
        datos["escala"], datos["crs"], datos["ancho_px"], datos["alto_px"],
        datos["sha256"]))
    return cur.fetchone()[0]


def guardar_capa(cur, organizacion_id, ortomosaico_id, fecha, fila):
    cur.execute(SENTENCIAS["insertar_capa"], (
        organizacion_id, ortomosaico_id, fecha, fila["indice"], fila["ruta_cog"],
        fila["escala"], fila.get("minimo"), fila.get("maximo"), fila.get("media"),
        fila.get("desvio"), fila.get("p5"), fila.get("p95")))
    return cur.fetchone()[0]


def guardar_zona(cur, organizacion_id, vuelo_id, vuelo_fecha, poligono,
                 detalle):
    cur.execute(SENTENCIAS["insertar_zona"], (
        organizacion_id, vuelo_id, vuelo_fecha, poligono["zona"],
        json.dumps(poligono["geometry"]), poligono["superficie_ha"],
        detalle.get("metodo", "kmeans"), detalle["k"], _js(detalle)))
    return cur.fetchone()[0]


def guardar_recomendacion(cur, organizacion_id, vuelo_id, vuelo_fecha, rec):
    """
    Guarda una recomendación del dominio.

    `fuente` va sin valor por omisión: si llegara vacía, la base la rechaza
    con su NOT NULL. Son dos redes para la misma regla, a propósito.
    """
    cur.execute(SENTENCIAS["insertar_recomendacion"], (
        organizacion_id, vuelo_id, vuelo_fecha, rec.texto, rec.umbral_aplicado,
        _js(rec.supuestos), rec.fuente, rec.version_motor))


def guardar_calibracion_biomasa(cur, organizacion_id, vuelo_id, vuelo_fecha,
                                calibracion):
    cur.execute(SENTENCIAS["insertar_calibracion_biomasa"], (
        organizacion_id, vuelo_id, vuelo_fecha, calibracion.indice, "lineal",
        calibracion.pendiente, calibracion.ordenada, calibracion.r2,
        calibracion.n, calibracion.origen))
    return cur.fetchone()[0]


def serie_temporal(cur, lote_id, indice):
    """
    Evolución de un índice en el tiempo, SOLO con vuelos comparables.

    La vista indice.serie_comparable ya excluye los vuelos sin calibración
    radiométrica. No hay una versión de esta función que los incluya, y esa
    ausencia es deliberada.
    """
    cur.execute(SENTENCIAS["serie_temporal"], (lote_id, indice))
    return cur.fetchall()
