# ═══════════════════════════════════════════════════════════════════════
# RÁSTER · INGESTA DEL ORTOMOSAICO
#
# La puerta de entrada del motor. Recibe un ortomosaico de reflectancia ya
# generado (DJI Terra, Pix4D, OpenDroneMap) y lo convierte al formato
# canónico del proyecto: COG uint16 escalado x10.000, con cada banda
# nombrada por su ROL.
#
# El motor NO hace fotogrametría ni procesa fotos crudas. Esa frontera es
# legal antes que técnica: OpenDroneMap es AGPL-3.0, y usarlo como proceso
# externo no contagia la licencia, mientras que embeber su código sí.
#
# Acá también se valida que lo que entró sea reflectancia y no números
# digitales sin calibrar: si los valores no tienen pinta de reflectancia, el
# vuelo se marca y no se calla.
# ═══════════════════════════════════════════════════════════════════════

import hashlib
import os

import numpy as np
import rasterio
from rasterio.features import dataset_features

from motor.dominio.errores import ErrorDominio
from motor.dominio.perfil import ROLES_NO_ESPECTRALES
from motor.raster import cog, ventanas

# La reflectancia física va de 0 a 1. Se acepta hasta 1,2 porque el
# especular sobre agua o plástico puede pasarse un poco sin que el vuelo
# esté mal. Más que eso ya no es reflectancia.
REFLECTANCIA_MAXIMA_PLAUSIBLE = 1.2

# Si más de este porcentaje de píxeles se sale del rango, no es ruido: es
# que el ortomosaico está en números digitales, no en reflectancia.
TOLERANCIA_FUERA_DE_RANGO = 0.02


def sha256_de(ruta, bloque=1024 * 1024):
    """Hash del archivo de entrada. Va a auditoria.corrida."""
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for trozo in iter(lambda: f.read(bloque), b""):
            h.update(trozo)
    return h.hexdigest()


def inspeccionar(ruta, perfil, escala_entrada=None, muestreo=8):
    """
    Mira el ortomosaico sin convertirlo y dice si tiene sentido.

    `muestreo` salta bloques: con 8 se revisa uno de cada ocho, que alcanza
    para detectar un ortomosaico sin calibrar y evita leer todo el archivo.
    """
    with rasterio.open(ruta) as ds:
        if ds.count < len(perfil.bandas):
            raise ErrorDominio(
                f"El ortomosaico tiene {ds.count} bandas y el perfil «{perfil.id}» "
                f"declara {len(perfil.bandas)}. ¿Es el perfil correcto?")

        escala = escala_entrada or _escala_probable(ds.dtypes[0])
        fuera, total = 0, 0

        # La pancromática y la térmica NO son reflectancia: una térmica en
        # centikelvin daría "fuera de rango" en cada píxel y haría rechazar
        # un vuelo de Altum perfectamente válido.
        espectrales = [b for b in perfil.bandas
                       if b.rol not in ROLES_NO_ESPECTRALES]

        for i, ventana in enumerate(ventanas.bloques(ds.width, ds.height)):
            if i % muestreo:
                continue

            for banda in espectrales:
                if banda.orden > ds.count:
                    continue
                datos = ds.read(banda.orden, window=ventana).astype(np.float64) / escala
                if ds.nodata is not None:
                    datos = datos[datos != ds.nodata / escala]
                if datos.size == 0:
                    continue
                total += datos.size
                fuera += int(np.count_nonzero(
                    (datos < -0.05) | (datos > REFLECTANCIA_MAXIMA_PLAUSIBLE)))

        proporcion = fuera / total if total else 0.0

        return {
            "ancho": ds.width,
            "alto": ds.height,
            "n_bandas": ds.count,
            "dtype": ds.dtypes[0],
            "crs": str(ds.crs),
            "nodata": ds.nodata,
            "escala_supuesta": escala,
            "proporcion_fuera_de_rango": proporcion,
            "parece_reflectancia": proporcion <= TOLERANCIA_FUERA_DE_RANGO,
            "resolucion_m": abs(ds.transform.a),
        }


def _escala_probable(dtype):
    """
    Adivina el factor de escala de la entrada según su tipo de dato.

    Un float viene en reflectancia 0-1 (escala 1); un entero de 16 bits casi
    siempre viene escalado x10.000, como Sentinel-2. Es una suposición, y por
    eso se puede pisar con --escala-entrada.
    """
    return 1.0 if str(dtype).startswith("float") else 10000.0


def convertir(ruta_origen, ruta_destino, perfil, escala_entrada=None,
              escala_salida=10000):
    """
    Escribe el COG canónico: uint16 x10.000, bandas nombradas por rol.

    Devuelve el diccionario que se guarda en vuelo.ortomosaico.
    """
    informe = inspeccionar(ruta_origen, perfil, escala_entrada)
    escala = escala_entrada or informe["escala_supuesta"]

    if not informe["parece_reflectancia"]:
        raise ErrorDominio(
            f"El {informe['proporcion_fuera_de_rango']:.1%} de los píxeles cae fuera "
            f"del rango de reflectancia (0 a {REFLECTANCIA_MAXIMA_PLAUSIBLE}). Lo más "
            f"probable es que el ortomosaico esté en números digitales, sin calibración "
            f"radiométrica. Ese dato no se puede comparar entre fechas. Si estás seguro "
            f"de la escala, pasala con --escala-entrada.")

    bandas_espectrales = [b for b in perfil.bandas
                          if b.rol not in ROLES_NO_ESPECTRALES]

    os.makedirs(os.path.dirname(os.path.abspath(ruta_destino)), exist_ok=True)

    with rasterio.open(ruta_origen) as origen:
        perfil_salida = cog.perfil_de_salida(
            origen.profile, "uint16", 0, n_bandas=len(bandas_espectrales))

        with rasterio.open(ruta_destino, "w", **perfil_salida) as destino:
            for indice_salida, banda in enumerate(bandas_espectrales, start=1):
                # El nombre de banda es el ROL: así el archivo se explica solo
                # cuando alguien lo abre en QGIS dentro de dos años.
                destino.set_band_description(indice_salida, banda.rol)

                for ventana in ventanas.bloques(origen.width, origen.height):
                    datos = origen.read(banda.orden, window=ventana).astype(np.float32)
                    validos = np.isfinite(datos)
                    if origen.nodata is not None:
                        validos &= datos != origen.nodata

                    reflectancia = datos / float(escala)
                    salida = np.zeros(datos.shape, dtype=np.uint16)   # 0 = nodata
                    if validos.any():
                        escalados = np.rint(reflectancia[validos] * escala_salida)
                        escalados = np.clip(escalados, 1, 65535)
                        salida[validos] = escalados.astype(np.uint16)

                    destino.write(salida, indice_salida, window=ventana)

            destino.update_tags(
                escala=str(escala_salida),
                perfil_camara=perfil.id,
                roles=",".join(b.rol for b in bandas_espectrales),
            )

    cog.agregar_overviews(ruta_destino)

    return {
        "ruta_cog": ruta_destino,
        "footprint": huella(ruta_destino),
        "n_bandas": len(bandas_espectrales),
        "dtype": "uint16",
        "escala": escala_salida,
        "crs": informe["crs"],
        "ancho_px": informe["ancho"],
        "alto_px": informe["alto"],
        "sha256": sha256_de(ruta_origen),
        "resolucion_m": informe["resolucion_m"],
    }


def huella(ruta):
    """
    Polígono de la zona con datos, en EPSG:4326, listo para PostGIS.

    Es la huella real —no el rectángulo del archivo— porque un ortomosaico
    siempre tiene esquinas vacías, y buscar "qué vuelos tocan este lote"
    con el rectángulo trae vuelos que no lo tocan.
    """
    with rasterio.open(ruta) as ds:
        for rasgo in dataset_features(ds, bidx=1, as_mask=True, geographic=True,
                                      precision=6):
            return rasgo["geometry"]
    return None


def roles_disponibles(ruta):
    """Lee del propio COG qué rol ocupa cada banda."""
    with rasterio.open(ruta) as ds:
        return {desc: i for i, desc in enumerate(ds.descriptions, start=1) if desc}
