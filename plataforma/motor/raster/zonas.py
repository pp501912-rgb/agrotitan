# ═══════════════════════════════════════════════════════════════════════
# RÁSTER · ZONAS DE MANEJO
#
# Divide el lote en zonas homogéneas con k-means sobre las capas de índice.
#
# DOS DECISIONES QUE HAY QUE ENTENDER ────────────────────────────────────
#
# 1. La zonificación se hace a la RESOLUCIÓN DE APLICACIÓN (3 m por
#    omisión), no a la del vuelo. Ninguna fertilizadora varía la dosis cada
#    5 cm: zonificar a esa resolución produce un mapa que la máquina no
#    puede seguir. Además, así la capa entra entera en memoria y el k-means
#    deja de ser un problema: un lote de 100 ha a 3 m son ~1.100 x 1.000
#    píxeles, unos pocos megabytes.
#
# 2. Las manchitas se ABSORBEN, no se suavizan. Un filtro de mediana sobre
#    etiquetas de zona inventa zonas intermedias que no existen. Lo correcto
#    es buscar los grupos conectados menores a la superficie mínima
#    aplicable y asignarlos a la zona vecina dominante.
# ═══════════════════════════════════════════════════════════════════════

import numpy as np
from rasterio import features
from scipy import ndimage
from shapely.geometry import shape
from sklearn.cluster import KMeans

from motor.dominio.errores import DatoInsuficiente, ErrorDominio
from motor.raster import indices as capas

# Resolución a la que trabaja la maquinaria. Por debajo de esto, la
# variabilidad que se mapea no se puede aplicar.
RESOLUCION_APLICACION_M = 3.0

# Superficie mínima de una zona. Media hectárea es lo que justifica un
# cambio de dosis en una pasada; menos que eso es ruido para la máquina.
SUPERFICIE_MINIMA_HA = 0.5

# El k-means se entrena sobre una muestra, no sobre todos los píxeles: con
# 100.000 el centroide ya no se mueve, y el costo es despreciable.
TAMANO_MUESTRA = 100000

SEMILLA = 20260315      # fija: dos corridas iguales tienen que dar lo mismo


def zonificar(rutas_capas, k=4, resolucion_m=RESOLUCION_APLICACION_M,
              superficie_minima_ha=SUPERFICIE_MINIMA_HA):
    """
    Genera zonas de manejo a partir de una o más capas de índice.

    Devuelve (poligonos, detalle). Cada polígono es un dict con la geometría
    GeoJSON, el número de zona y su superficie.
    """
    if not rutas_capas:
        raise DatoInsuficiente("No hay capas de índice para zonificar")
    if k < 2:
        raise ErrorDominio(f"k = {k}: hacen falta al menos dos zonas")

    pilas, mascaras, transform, crs = [], [], None, None

    for ruta in rutas_capas:
        valores, validos, t, c = capas.leer_a_resolucion(ruta, resolucion_m)
        if transform is None:
            transform, crs = t, c
        elif valores.shape != pilas[0].shape:
            raise ErrorDominio(
                "Las capas de índice no tienen el mismo tamaño después de "
                "remuestrear: ¿son del mismo vuelo?")
        pilas.append(valores)
        mascaras.append(validos)

    validos = np.logical_and.reduce(mascaras) & np.all(
        [np.isfinite(p) for p in pilas], axis=0)

    if validos.sum() < k * 100:
        raise DatoInsuficiente(
            f"Quedan {int(validos.sum())} píxeles válidos a {resolucion_m} m: "
            f"muy pocos para {k} zonas. Probá con menos zonas o con más resolución.")

    # Cada índice tiene su propia escala (un NDVI va de -1 a 1, un CIre de 0
    # a 15). Sin estandarizar, el k-means agruparía por el índice de números
    # más grandes y los demás no pesarían nada.
    columnas = []
    for pila in pilas:
        v = pila[validos]
        desvio = v.std()
        columnas.append((v - v.mean()) / desvio if desvio > 0 else v * 0.0)

    matriz = np.column_stack(columnas)

    generador = np.random.default_rng(SEMILLA)
    if matriz.shape[0] > TAMANO_MUESTRA:
        muestra = matriz[generador.choice(matriz.shape[0], TAMANO_MUESTRA,
                                          replace=False)]
    else:
        muestra = matriz

    modelo = KMeans(n_clusters=k, n_init=10, random_state=SEMILLA).fit(muestra)

    etiquetas = np.zeros(validos.shape, dtype=np.int16) - 1
    etiquetas[validos] = modelo.predict(matriz)

    # Las zonas se numeran de menor a mayor vigor promedio del primer índice.
    # Así "zona 1" siempre significa lo mismo entre lotes y entre campañas, y
    # el mapa se lee sin leyenda.
    etiquetas = _renumerar_por_vigor(etiquetas, pilas[0], validos, k)

    if crs is not None and crs.is_geographic:
        raise ErrorDominio(
            f"El ortomosaico está en {crs}, que es un sistema en grados. Las "
            f"superficies de las zonas saldrían mal: reproyectá a la UTM de la zona "
            f"(32721 para 21S, 32720 para 20S, 32719 para 19S) antes de zonificar.")

    pixel_ha = abs(transform.a * transform.e) / 10000.0
    minimo_px = max(1, int(round(superficie_minima_ha / pixel_ha)))
    etiquetas = _absorber_manchitas(etiquetas, minimo_px, k)

    poligonos = _vectorizar(etiquetas, transform, crs, pixel_ha)

    detalle = {
        "k": k,
        "resolucion_m": resolucion_m,
        "superficie_minima_ha": superficie_minima_ha,
        "pixeles_validos": int(validos.sum()),
        "capas_usadas": list(rutas_capas),
        "semilla": SEMILLA,
    }

    return poligonos, detalle


def _renumerar_por_vigor(etiquetas, referencia, validos, k):
    medias = []
    for z in range(k):
        seleccion = (etiquetas == z) & validos
        medias.append((float(referencia[seleccion].mean()) if seleccion.any()
                       else float("inf"), z))

    orden = {z: nuevo for nuevo, (_, z) in enumerate(sorted(medias))}
    salida = etiquetas.copy()
    for viejo, nuevo in orden.items():
        salida[etiquetas == viejo] = nuevo
    return salida


def _absorber_manchitas(etiquetas, minimo_px, k):
    """
    Absorbe los grupos conectados más chicos que la superficie mínima.

    Cada manchita se le asigna a la zona que más la rodea. Se hace en dos
    pasadas porque absorber una manchita puede dejar a otra por debajo del
    mínimo al fusionarse.
    """
    salida = etiquetas.copy()
    estructura = ndimage.generate_binary_structure(2, 1)   # vecindad de 4

    for _ in range(2):
        cambio = False
        for z in range(k):
            grupos, cantidad = ndimage.label(salida == z, structure=estructura)
            if cantidad == 0:
                continue

            tamanos = ndimage.sum_labels(np.ones_like(grupos), grupos,
                                         index=range(1, cantidad + 1))

            for numero, tamano in enumerate(tamanos, start=1):
                if tamano >= minimo_px:
                    continue

                mancha = grupos == numero
                borde = ndimage.binary_dilation(mancha, structure=estructura) & ~mancha
                vecinas = salida[borde]
                vecinas = vecinas[(vecinas >= 0) & (vecinas != z)]

                if vecinas.size:
                    # bincount quiere enteros nativos: las etiquetas son int16.
                    salida[mancha] = np.bincount(vecinas.astype(np.int64)).argmax()
                    cambio = True

        if not cambio:
            break

    return salida


def _vectorizar(etiquetas, transform, crs, pixel_ha):
    poligonos = []
    mascara = etiquetas >= 0

    for geometria, valor in features.shapes(etiquetas.astype(np.int32),
                                            mask=mascara, transform=transform):
        # La superficie sale de la geometría proyectada, con los agujeros ya
        # descontados por shapely. Contar píxeles a mano era más código y más
        # frágil, y el ráster ya está en metros.
        superficie_m2 = shape(geometria).area

        poligonos.append({
            "zona": int(valor) + 1,          # las zonas se cuentan desde 1
            "geometry": geometria,
            "superficie_ha": round(superficie_m2 / 10000.0, 4),
            "crs": str(crs),
        })

    return sorted(poligonos, key=lambda p: (p["zona"], -p["superficie_ha"]))


def estadisticas_zonales(ruta_capa, poligonos):
    """
    Media y desvío de una capa de índice dentro de cada zona.

    Se calcula a resolución completa, rasterizando las zonas bloque por
    bloque: el promedio zonal es el número que después decide una dosis, así
    que se hace sobre todos los píxeles y no sobre la versión remuestreada.
    """
    import rasterio

    from motor.dominio.estadistica import Acumulador
    from motor.raster import cog, ventanas

    acumuladores = {}

    with rasterio.open(ruta_capa) as ds:
        escala = float(ds.tags().get("escala", 10000))
        formas = [(p["geometry"], p["zona"]) for p in poligonos]

        for ventana in ventanas.bloques(ds.width, ds.height):
            crudo = ds.read(1, window=ventana)
            validos = crudo != cog.NODATA_INDICE
            if not validos.any():
                continue

            zonas_bloque = features.rasterize(
                formas,
                out_shape=crudo.shape,
                transform=ds.window_transform(ventana),
                fill=0,
                dtype="int32",
            )

            valores = crudo.astype(np.float32) / escala

            for zona in np.unique(zonas_bloque):
                if zona == 0:
                    continue
                seleccion = (zonas_bloque == zona) & validos
                if not seleccion.any():
                    continue
                acumuladores.setdefault(int(zona), Acumulador())
                ventanas.acumular_bloque(acumuladores[int(zona)], valores[seleccion])

    return {zona: acc.resumen() for zona, acc in sorted(acumuladores.items())}
