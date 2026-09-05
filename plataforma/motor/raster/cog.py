# ═══════════════════════════════════════════════════════════════════════
# RÁSTER · ESCRITURA DE COG
#
# Todo lo que sale del motor es un Cloud Optimized GeoTIFF con overviews.
# No es moda: sin overviews, QGIS y el visor tienen que leer el archivo
# entero para dibujar una vista alejada, y con archivos de gigabytes eso es
# la diferencia entre trabajar y esperar.
#
# ESCALA DE LOS ÍNDICES ──────────────────────────────────────────────────
# Los índices se guardan como enteros de 16 bits con signo, con un factor de
# escala POR ÍNDICE que se elige a partir del rango declarado en el catálogo.
# Un NDVI (-1 a 1) entra cómodo con escala 10.000; un CIre (0 a 15) no —
# 15 x 10.000 desborda int16—, así que usa 1.000. El factor se guarda en el
# propio archivo y en indice.capa.escala: sin él, el número no se interpreta.
# ═══════════════════════════════════════════════════════════════════════

import numpy as np
import rasterio
from rasterio.enums import Resampling

from motor.dominio.catalogo import TECHO_INT16, escala_de_almacenamiento

# Valor reservado para "no hay dato" en las capas de índice.
NODATA_INDICE = -32768

# El techo de int16 y la elección de escala viven en el dominio: son
# decisiones sobre cómo se representa un índice, no sobre cómo se escribe
# un archivo. Acá solo se aplican.
_TECHO_INT16 = TECHO_INT16

NIVELES_OVERVIEW = (2, 4, 8, 16, 32)


# escala_para vive en dominio.catalogo.escala_de_almacenamiento
escala_para = escala_de_almacenamiento


def a_entero(valores, escala, validos):
    """Convierte un bloque de índice a int16 escalado, con nodata."""
    salida = np.full(valores.shape, NODATA_INDICE, dtype=np.int16)

    if validos is not None:
        finitos = validos & np.isfinite(valores)
    else:
        finitos = np.isfinite(valores)

    if finitos.any():
        escalados = np.rint(valores[finitos] * escala)
        # Recorte duro: un píxel fuera de rango es preferible al desborde
        # silencioso de int16, que convertiría un valor alto en uno negativo.
        escalados = np.clip(escalados, -_TECHO_INT16, _TECHO_INT16)
        salida[finitos] = escalados.astype(np.int16)

    return salida


def perfil_de_salida(perfil_origen, dtype, nodata, n_bandas=1):
    """Perfil de escritura COG a partir del perfil del ráster de origen."""
    perfil = perfil_origen.copy()
    perfil.update(
        driver="GTiff",
        dtype=dtype,
        count=n_bandas,
        nodata=nodata,
        tiled=True,
        blockxsize=512,
        blockysize=512,
        compress="deflate",
        predictor=2,          # predictor horizontal: mucho mejor en enteros
        zlevel=6,
        interleave="band",
        BIGTIFF="IF_SAFER",
    )
    return perfil


def agregar_overviews(ruta, remuestreo=Resampling.average):
    """
    Agrega los overviews. Se hace al final, con el archivo ya cerrado.

    Para índices continuos el promedio es lo correcto; para una capa de zonas
    hay que pasar Resampling.nearest, porque promediar etiquetas de zona
    inventa zonas que no existen.
    """
    with rasterio.open(ruta, "r+") as ds:
        ds.build_overviews(NIVELES_OVERVIEW, remuestreo)
        ds.update_tags(ns="rio_overview", resampling=remuestreo.name)
