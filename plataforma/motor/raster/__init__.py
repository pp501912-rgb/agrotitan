# ═══════════════════════════════════════════════════════════════════════
# CAPA RÁSTER
#
# Todo lo que necesita numpy, rasterio y GDAL. Deliberadamente delgada: acá
# NO se toma ninguna decisión agronómica, se mueven píxeles y se le pregunta
# al dominio. El día que cambie la librería de rásters, el criterio no se toca.
#
# ⚠ ADVERTENCIA DE ESTADO: este paquete NO se pudo ejecutar en el entorno
#   donde se escribió (sin acceso a PyPI para instalar numpy/rasterio).
#   Sus pruebas están en pruebas/raster/ y corren en la PC de destino
#   después de `conda env create -f entorno.yml`. Ver LEEME.md.
# ═══════════════════════════════════════════════════════════════════════
