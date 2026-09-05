# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · EXPORTACIÓN DE LA PRESCRIPCIÓN
#
# El mapa de prescripción es lo único de todo esto que la máquina lee. Si
# el archivo sale mal, el resto del trabajo no existió.
#
# Se exporta GeoJSON acá —Python puro, sin dependencias— y shapefile en
# motor/exportar_shp.py, que necesita pyshp. El shapefile sigue siendo el
# formato que consume la enorme mayoría de los monitores del Cono Sur, por
# viejo que sea.
#
# ISO-XML (ISOBUS, ISO 11783-10) queda documentado y sin implementar: la
# especificación está en docs/00-antecedentes.md. Para el que lo necesite,
# la referencia es el ISOv4Plugin de AgGateway ADAPT.
#
# NOMBRES DE CAMPO ──────────────────────────────────────────────────────
# El shapefile trunca los nombres de columna a 10 caracteres, sin avisar y
# sin preguntar. Los nombres se eligen cortos acá, en un solo lugar, para
# que el GeoJSON y el shapefile tengan las mismas columnas y nadie tenga
# que adivinar si "justificac" era "justificacion".
# ═══════════════════════════════════════════════════════════════════════

import json

from motor.dominio.errores import ErrorDominio
from motor.version import VERSION

# nombre corto (<= 10 caracteres, límite del shapefile) -> qué contiene
CAMPOS = (
    ("zona", "número de zona, de menor a mayor vigor"),
    ("sup_ha", "superficie de la zona en hectáreas"),
    ("dosis", "dosis del insumo en la unidad declarada"),
    ("unidad", "unidad de la dosis, por ejemplo kg/ha"),
    ("insumo", "qué se aplica"),
    ("ind_suf", "índice de suficiencia de la zona"),
    ("motivo", "por qué esa dosis"),
)

NOMBRES_CAMPOS = tuple(nombre for nombre, _ in CAMPOS)


def armar_propiedades(zona, superficie_ha, insumo, unidad, dosis=None,
                      indice_suficiencia=None, motivo=""):
    """Las propiedades de una zona, con los nombres definitivos."""
    return {
        "zona": int(zona),
        "sup_ha": round(float(superficie_ha), 4),
        "dosis": None if dosis is None else round(float(dosis), 2),
        "unidad": unidad,
        "insumo": insumo,
        "ind_suf": (None if indice_suficiencia is None
                    else round(float(indice_suficiencia), 4)),
        # El shapefile corta los textos largos: se recorta acá, con criterio,
        # en vez de dejar que el driver lo haga de cualquier forma.
        "motivo": (motivo or "")[:254],
    }


def coleccion(poligonos, prescripcion, insumo, unidad, crs=None,
              metadatos=None):
    """
    Arma el FeatureCollection de la prescripción.

    `poligonos` viene de la zonificación; `prescripcion` es {zona: datos} y
    puede ser None cuando se exporta solamente la zonificación.
    """
    if not poligonos:
        raise ErrorDominio("No hay polígonos para exportar")

    prescripcion = prescripcion or {}
    rasgos = []

    for poligono in poligonos:
        zona = poligono["zona"]
        datos = prescripcion.get(zona, {})

        rasgos.append({
            "type": "Feature",
            "geometry": poligono["geometry"],
            "properties": armar_propiedades(
                zona=zona,
                superficie_ha=poligono["superficie_ha"],
                insumo=insumo,
                unidad=unidad,
                dosis=datos.get("dosis_kg_ha"),
                indice_suficiencia=datos.get("indice_suficiencia"),
                motivo=datos.get("justificacion", ""),
            ),
        })

    coleccion = {
        "type": "FeatureCollection",
        "features": rasgos,
        # Los metadatos viajan con el archivo: dentro de dos campañas nadie
        # se acuerda con qué versión ni con qué supuestos se generó esto.
        "metadata": dict(metadatos or {}, version_motor=VERSION,
                         insumo=insumo, unidad=unidad),
    }

    if crs:
        coleccion["crs"] = {"type": "name", "properties": {"name": str(crs)}}

    return coleccion


def escribir_geojson(coleccion_geojson, ruta):
    """Escribe el GeoJSON. Devuelve la ruta."""
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(coleccion_geojson, f, ensure_ascii=False)
        f.write("\n")
    return ruta


def resumen(coleccion_geojson):
    """
    Resumen para el informe: cuánto insumo, sobre cuántas hectáreas.

    Es el número que mira quien compra la urea, y el que hay que poder
    defender: superficie por zona por dosis, sin vueltas.
    """
    total_ha = 0.0
    total_insumo = 0.0
    zonas_con_dosis = 0

    for rasgo in coleccion_geojson["features"]:
        p = rasgo["properties"]
        total_ha += p["sup_ha"]
        if p["dosis"]:
            total_insumo += p["dosis"] * p["sup_ha"]
            zonas_con_dosis += 1

    return {
        "zonas": len(coleccion_geojson["features"]),
        "zonas_con_dosis": zonas_con_dosis,
        "superficie_total_ha": round(total_ha, 2),
        "insumo_total": round(total_insumo, 1),
        "unidad": coleccion_geojson["metadata"]["unidad"],
        "dosis_media_ponderada": (round(total_insumo / total_ha, 1)
                                  if total_ha else 0.0),
    }
