# ═══════════════════════════════════════════════════════════════════════
# RÁSTER · CÁLCULO DE ÍNDICES
#
# Recorre el COG canónico por bloques y escribe un COG por índice.
#
# Notar lo que NO hay acá: ninguna fórmula. Las fórmulas están en
# catalogo/indices.json y las evalúa dominio/formula.py. Este módulo
# solamente lee bloques, se los pasa al dominio y escribe el resultado.
# Por eso el evaluador se puede probar con dos decimales y valer para
# millones de píxeles: es el mismo código.
# ═══════════════════════════════════════════════════════════════════════

import os

import numpy as np
import rasterio
from rasterio.enums import Resampling

from motor.dominio import catalogo as cat
from motor.dominio.errores import IndiceNoDisponible
from motor.dominio.estadistica import Acumulador
from motor.raster import cog, ventanas


def calcular(ruta_cog, indices_pedidos, perfil, directorio_salida,
             catalogo=None):
    """
    Calcula los índices pedidos y devuelve (resultados, no_disponibles).

    Los que la cámara no puede calcular NO se calculan con una banda
    parecida: se devuelven aparte, con el motivo, para que el informe los
    muestre. Un usuario tiene que ver qué no se pudo hacer.
    """
    catalogo = catalogo if catalogo is not None else cat.cargar()
    disponibles, no_disponibles = cat.disponibilidad(perfil, catalogo)

    resultados, rechazados = {}, {}

    for nombre in indices_pedidos:
        if nombre not in catalogo:
            rechazados[nombre] = f"«{nombre}» no está en el catálogo de índices"
        elif nombre in no_disponibles:
            alternativas = cat.alternativas(nombre, perfil, catalogo)
            motivo = no_disponibles[nombre]
            if alternativas:
                motivo += f". Alternativas publicadas para esta cámara: {', '.join(alternativas)}"
            rechazados[nombre] = motivo

    os.makedirs(directorio_salida, exist_ok=True)

    for nombre in indices_pedidos:
        if nombre in rechazados:
            continue
        resultados[nombre] = _una_capa(
            ruta_cog, disponibles[nombre], directorio_salida)

    return resultados, rechazados


def _una_capa(ruta_cog, indice, directorio_salida):
    """Calcula un índice y escribe su COG. Devuelve la fila de indice.capa."""
    ruta_salida = os.path.join(directorio_salida, f"{indice.nombre.lower()}.tif")
    acumulador = Acumulador()

    with rasterio.open(ruta_cog) as origen:
        escala_entrada = float(origen.tags().get("escala", 10000))
        ordenes = {d: i for i, d in enumerate(origen.descriptions, start=1) if d}

        faltantes = indice.roles_requeridos - set(ordenes)
        if faltantes:
            raise IndiceNoDisponible(
                f"{indice.nombre} necesita {sorted(faltantes)} y el ortomosaico "
                f"no las trae: {sorted(ordenes)}")

        # Solo se leen las bandas que la fórmula usa. Leer las cinco cuando el
        # NDVI necesita dos es multiplicar por 2,5 el tiempo de disco.
        ordenes_usados = {r: ordenes[r] for r in indice.roles_requeridos}

        perfil_salida = cog.perfil_de_salida(
            origen.profile, "int16", cog.NODATA_INDICE, n_bandas=1)

        with rasterio.open(ruta_salida, "w", **perfil_salida) as destino:
            destino.set_band_description(1, indice.nombre)

            for ventana in ventanas.bloques(origen.width, origen.height):
                bandas, validos = ventanas.leer_bandas(
                    origen, ventana, ordenes_usados, escala_entrada,
                    nodata=origen.nodata)

                # Un denominador en cero es normal sobre nodata y sobre agua.
                # Se silencia el aviso de numpy y se descarta el píxel después:
                # el resultado sale inf o nan y la máscara lo saca.
                with np.errstate(divide="ignore", invalid="ignore"):
                    valores = indice.calcular(bandas)

                valores = np.asarray(valores, dtype=np.float32)
                validos = validos & np.isfinite(valores)

                destino.write(
                    cog.a_entero(valores, indice.escala, validos), 1, window=ventana)

                if validos.any():
                    ventanas.acumular_bloque(acumulador, valores[validos])

            destino.update_tags(
                indice=indice.nombre,
                escala=str(indice.escala),
                fuente=indice.fuente,
            )

    cog.agregar_overviews(ruta_salida)

    resumen = acumulador.resumen()
    fila = {
        "indice": indice.nombre,
        "ruta_cog": ruta_salida,
        "escala": indice.escala,
        "fuente": indice.fuente,
    }

    if resumen:
        fila.update(
            minimo=round(resumen["minimo"], 4),
            maximo=round(resumen["maximo"], 4),
            media=round(resumen["media"], 4),
            desvio=round(resumen["desvio"], 4),
            n_px=resumen["n"],
        )

    return fila


def leer_a_resolucion(ruta_capa, resolucion_objetivo_m):
    """
    Lee una capa de índice remuestreada, en unidades físicas.

    La zonificación NO se hace a la resolución del vuelo: ninguna
    fertilizadora varía la dosis cada 5 cm. Se trabaja a la resolución de
    aplicación (metros), lo que además hace que la capa entre entera en
    memoria y el k-means sea trivial.
    """
    with rasterio.open(ruta_capa) as ds:
        escala = float(ds.tags().get("escala", 10000))
        resolucion_actual = abs(ds.transform.a)
        factor = max(1, int(round(resolucion_objetivo_m / resolucion_actual)))

        alto = max(1, ds.height // factor)
        ancho = max(1, ds.width // factor)

        crudo = ds.read(1, out_shape=(alto, ancho),
                        resampling=Resampling.average)

        validos = crudo != cog.NODATA_INDICE
        valores = np.where(validos, crudo.astype(np.float32) / escala, np.nan)
        transform = ds.transform * ds.transform.scale(ds.width / ancho,
                                                      ds.height / alto)

        return valores, validos, transform, ds.crs
