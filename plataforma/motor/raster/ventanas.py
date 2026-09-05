# ═══════════════════════════════════════════════════════════════════════
# RÁSTER · LECTURA POR VENTANAS
#
# La regla que hace que 16 GB alcancen: NUNCA se lee un ráster completo.
#
# Un ortomosaico de 100 ha a 5 cm son 40.000 x 40.000 píxeles por 5 bandas:
# 32 GB en float32. No entra en memoria, y no tiene que entrar. Se recorre
# en bloques de 512x512, que son unos 5 MB por banda.
#
# Todo el paquete raster/ pasa por acá. Si alguien escribe src.read() sin
# ventana, el motor deja de correr en la PC de destino: por eso está en un
# solo lugar y comentado.
# ═══════════════════════════════════════════════════════════════════════

import numpy as np
from rasterio.windows import Window

from motor.dominio.estadistica import Acumulador

LADO_BLOQUE = 512


def bloques(ancho, alto, lado=LADO_BLOQUE):
    """Genera las ventanas que cubren el ráster, de arriba a abajo."""
    for fila in range(0, alto, lado):
        alto_bloque = min(lado, alto - fila)
        for columna in range(0, ancho, lado):
            ancho_bloque = min(lado, ancho - columna)
            yield Window(columna, fila, ancho_bloque, alto_bloque)


def leer_bandas(dataset, ventana, ordenes, escala, nodata=None):
    """
    Lee una ventana de las bandas pedidas y la devuelve en reflectancia.

    `ordenes` mapea rol -> número de banda (1-based), que es lo que produce
    el perfil de cámara. Devuelve {rol: array float32} más la máscara de
    píxeles válidos.

    La división por `escala` es lo que convierte el entero almacenado en
    reflectancia física: se guarda uint16 x10.000 (como Sentinel-2) porque
    ocupa la mitad que float32, en disco y en RAM.
    """
    bandas, validos = {}, None

    for rol, orden in ordenes.items():
        crudo = dataset.read(orden, window=ventana)

        mascara = np.ones(crudo.shape, dtype=bool)
        if nodata is not None:
            mascara &= crudo != nodata

        bandas[rol] = crudo.astype(np.float32) / float(escala)
        validos = mascara if validos is None else (validos & mascara)

    return bandas, validos


def resumen_de_bloque(valores):
    """
    Resumen parcial de un bloque: (n, media, m2, minimo, maximo).

    numpy hace la parte pesada; combinar los parciales es aritmética delicada
    y vive en dominio.estadistica, donde se puede probar sin instalar nada.
    """
    valores = np.asarray(valores, dtype=np.float64).ravel()
    if valores.size == 0:
        return None

    media = float(valores.mean())
    m2 = float(((valores - media) ** 2).sum())
    return (valores.size, media, m2, float(valores.min()), float(valores.max()))


def acumular_bloque(acumulador, valores):
    """Incorpora un bloque al acumulador del dominio."""
    parcial = resumen_de_bloque(valores)
    if parcial is not None:
        acumulador.combinar(*parcial)
    return acumulador
