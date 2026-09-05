# ═══════════════════════════════════════════════════════════════════════
# MOTOR · ANÁLISIS MULTIESPECTRAL PARA AGRICULTURA DE PRECISIÓN
#
# Dos capas, deliberadamente separadas:
#
#   dominio/  El criterio agronómico. SIN numpy ni GDAL: se puede probar
#             en cualquier máquina, sin instalar nada. Acá vive todo lo
#             que hay que poder defender frente a un agrónomo.
#
#   raster/   La aritmética masiva y el I/O. CON numpy y rasterio. Delgada
#             a propósito: no toma ninguna decisión agronómica, solo mueve
#             píxeles y le pregunta al dominio.
#
# Esa frontera no es estética. El día que cambie la librería de rásters,
# el criterio agronómico no se toca.
# ═══════════════════════════════════════════════════════════════════════

from motor.version import VERSION

__all__ = ["VERSION"]
