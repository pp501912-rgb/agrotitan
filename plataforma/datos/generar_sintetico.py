#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# ORTOMOSAICO SINTÉTICO PARA PRUEBAS
#
# Genera un ortomosaico de 5 bandas con un gradiente de vigor y una zona
# degradada, para poder correr el pipeline entero SIN HABER VOLADO NUNCA.
#
# No es un juguete: es lo que permite que el motor tenga pruebas de punta a
# punta desde el primer día, y que un error de integración aparezca acá y no
# la primera vez que alguien sube un vuelo real de 8 GB.
#
#     python3 datos/generar_sintetico.py datos/ejemplo/orto.tif
#
# Necesita numpy y rasterio.
# ═══════════════════════════════════════════════════════════════════════

import os
import sys

import numpy as np
import rasterio
from rasterio.transform import from_origin

# UTM 21S: la zona de buena parte de Argentina. Se elige un CRS proyectado
# a propósito: la zonificación rechaza los sistemas en grados, porque en
# grados las superficies salen mal.
CRS = "EPSG:32721"

ANCHO, ALTO = 900, 700          # a 0,05 m/px son unos 45 x 35 m
RESOLUCION_M = 0.05
ESCALA = 10000                  # reflectancia x10.000, como el formato canónico

# Roles en el orden en que se escriben las bandas.
ROLES = ("blue", "green", "red", "rededge", "nir")


def generar(ruta, semilla=20260315):
    generador = np.random.default_rng(semilla)

    y, x = np.mgrid[0:ALTO, 0:ANCHO]

    # Gradiente de vigor de izquierda a derecha: el lote mejora hacia el este.
    vigor = 0.25 + 0.65 * (x / ANCHO)

    # Una mancha degradada, redonda, en el centro-izquierda: la falla que la
    # zonificación tiene que encontrar y separar.
    centro_y, centro_x, radio = ALTO * 0.55, ANCHO * 0.35, min(ALTO, ANCHO) * 0.18
    distancia = np.sqrt((y - centro_y) ** 2 + (x - centro_x) ** 2)
    vigor = np.where(distancia < radio, vigor * 0.45, vigor)

    # Una franja sobrefertilizada arriba: la referencia de nitrógeno.
    vigor[0:int(ALTO * 0.08), :] = np.clip(
        vigor[0:int(ALTO * 0.08), :] * 1.25, 0, 0.95)

    vigor = np.clip(vigor + generador.normal(0, 0.02, vigor.shape), 0.02, 0.98)

    # Reflectancias plausibles: el rojo cae con el vigor (la clorofila lo
    # absorbe) y el infrarrojo cercano sube (la estructura de la hoja lo
    # dispersa). Es la base física de todos los índices de vegetación.
    bandas = {
        "blue":    0.045 - 0.020 * vigor,
        "green":   0.090 - 0.020 * vigor,
        "red":     0.120 - 0.095 * vigor,
        "rededge": 0.180 + 0.130 * vigor,
        "nir":     0.220 + 0.480 * vigor,
    }

    transform = from_origin(500000.0, 6500000.0, RESOLUCION_M, RESOLUCION_M)

    perfil = {
        "driver": "GTiff", "width": ANCHO, "height": ALTO,
        "count": len(ROLES), "dtype": "uint16", "crs": CRS,
        "transform": transform, "nodata": 0,
        "tiled": True, "blockxsize": 512, "blockysize": 512,
        "compress": "deflate", "predictor": 2,
    }

    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)

    with rasterio.open(ruta, "w", **perfil) as ds:
        for i, rol in enumerate(ROLES, start=1):
            datos = np.clip(bandas[rol], 0.0001, 1.2) * ESCALA
            ds.write(np.rint(datos).astype(np.uint16), i)
            ds.set_band_description(i, rol)
        ds.update_tags(escala=str(ESCALA), sintetico="si")

    ndvi_esperado = ((bandas["nir"] - bandas["red"]) /
                     (bandas["nir"] + bandas["red"]))

    print(f"Escrito {ruta}")
    print(f"  {ANCHO} x {ALTO} px a {RESOLUCION_M} m  ({CRS})")
    print(f"  NDVI esperado: {ndvi_esperado.min():.3f} a {ndvi_esperado.max():.3f}, "
          f"media {ndvi_esperado.mean():.3f}")
    return ruta


if __name__ == "__main__":
    generar(sys.argv[1] if len(sys.argv) > 1 else "datos/ejemplo/orto.tif")
