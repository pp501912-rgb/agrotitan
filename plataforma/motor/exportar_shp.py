# ═══════════════════════════════════════════════════════════════════════
# EXPORTACIÓN A SHAPEFILE
#
# El formato que consume la enorme mayoría de los monitores de maquinaria,
# por viejo que sea. Se usa pyshp: son unos pocos kilobytes y no arrastra
# GDAL, a diferencia de fiona.
#
# El .prj se escribe a mano desde el WKT del CRS porque pyshp no lo hace, y
# un shapefile sin .prj es un archivo que el monitor abre en el lugar
# equivocado del planeta o directamente rechaza.
# ═══════════════════════════════════════════════════════════════════════

import os

import shapefile

from motor.dominio.exportar import CAMPOS

# Tipos DBF por campo. 'C' es texto, 'N' número con decimales.
_TIPOS = {
    "zona": ("N", 4, 0),
    "sup_ha": ("N", 12, 4),
    "dosis": ("N", 10, 2),
    "unidad": ("C", 12, 0),
    "insumo": ("C", 24, 0),
    "ind_suf": ("N", 8, 4),
    "motivo": ("C", 254, 0),
}


def escribir(coleccion_geojson, ruta_base, wkt_crs=None):
    """
    Escribe el .shp (más .shx, .dbf y .prj) de la prescripción.

    `ruta_base` va sin extensión. Devuelve la ruta del .shp.
    """
    os.makedirs(os.path.dirname(os.path.abspath(ruta_base)), exist_ok=True)

    with shapefile.Writer(ruta_base, shapeType=shapefile.POLYGON) as w:
        for nombre, _ in CAMPOS:
            tipo, largo, decimales = _TIPOS[nombre]
            w.field(nombre, tipo, largo, decimales)

        for rasgo in coleccion_geojson["features"]:
            w.shape(rasgo["geometry"])
            propiedades = rasgo["properties"]
            # El orden importa: el DBF no tiene nombres en las filas.
            w.record(*[_valor(propiedades[n]) for n, _ in CAMPOS])

    if wkt_crs:
        with open(f"{ruta_base}.prj", "w", encoding="utf-8") as f:
            f.write(wkt_crs)

    return f"{ruta_base}.shp"


def _valor(v):
    """El DBF no tiene nulos: un vacío se escribe como 0 o cadena vacía."""
    return "" if v is None else v
