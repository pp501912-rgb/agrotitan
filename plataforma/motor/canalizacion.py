# ═══════════════════════════════════════════════════════════════════════
# CANALIZACIÓN · EL PIPELINE COMPLETO
#
# Une todo: ingesta -> índices -> zonas -> estadísticas zonales ->
# prescripción -> exportación -> informe -> manifiesto.
#
# Es la única parte del motor que sabe el orden de las cosas. Cada módulo
# hace lo suyo sin saber que existe este archivo, y eso es a propósito:
# probar `nitrogeno.recomendar` no debería requerir un ortomosaico.
#
# ⚠ Necesita numpy y rasterio. No se pudo ejecutar en el entorno donde se
#   escribió: ver la nota de estado en LEEME.md.
# ═══════════════════════════════════════════════════════════════════════

import os
import time
from datetime import date

from motor.dominio import (biomasa, catalogo, exportar, manifiesto,
                           nitrogeno, perfil, recomendacion)
from motor.dominio.errores import DatoInsuficiente, ErrorDominio
from motor.version import VERSION

INDICES_POR_OMISION = ("NDVI", "NDRE", "GNDVI")

# El índice sobre el que se zonifica y se decide nitrógeno. NDRE y no NDVI
# porque el NDVI satura en canopeo denso, justo cuando hay que decidir.
INDICE_DE_MANEJO = "NDRE"


def procesar(ruta_ortomosaico, id_perfil, directorio_salida, indices=None,
             k_zonas=4, ndre_referencia=None, metadatos=None,
             puntos_biomasa=None):
    """
    Corre el pipeline entero. Devuelve 0 si salió todo bien.

    Lo que falta no detiene el proceso: si no hay franja de referencia se
    entrega el mapa de variabilidad y se dice por qué; si la calibración de
    biomasa es pobre se entrega igual, con la advertencia arriba. Lo que no
    pasa nunca es que un dato faltante se reemplace por una suposición
    silenciosa.
    """
    from motor import informe
    from motor.raster import indices as capas
    from motor.raster import ingesta, zonas

    comienzo = time.time()
    metadatos = dict(metadatos or {})
    os.makedirs(directorio_salida, exist_ok=True)

    p = perfil.cargar(id_perfil)
    cat = catalogo.cargar()
    pedidos = list(indices or INDICES_POR_OMISION)

    recomendaciones = []
    contexto = {
        "lote": metadatos.get("lote", "lote"),
        "campo": metadatos.get("campo", ""),
        "fecha": metadatos.get("fecha") or date.today().isoformat(),
        "perfil_camara": p.id,
        "comparable": metadatos.get("calibracion", "ninguna") != "ninguna",
    }

    # ── 1. Ingesta ─────────────────────────────────────────────────────
    ruta_canonica = os.path.join(directorio_salida, "ortomosaico.tif")
    datos_orto = ingesta.convertir(ruta_ortomosaico, ruta_canonica, p)

    # ── 2. Índices ─────────────────────────────────────────────────────
    directorio_indices = os.path.join(directorio_salida, "indices")
    resultados, rechazados = capas.calcular(
        ruta_canonica, pedidos, p, directorio_indices, cat)

    contexto["indices"] = resultados
    contexto["indices_no_disponibles"] = rechazados

    # ── 3. Zonas ───────────────────────────────────────────────────────
    capa_de_manejo = resultados.get(INDICE_DE_MANEJO) or next(
        iter(resultados.values()), None)

    if capa_de_manejo is None:
        raise ErrorDominio(
            f"No se pudo calcular ningún índice de los pedidos ({pedidos}) con "
            f"la cámara {p.id}. Motivos: {rechazados}")

    poligonos, detalle_zonas = zonas.zonificar(
        [capa_de_manejo["ruta_cog"]], k=k_zonas)

    contexto["zonas"] = poligonos
    contexto["detalle_zonas"] = detalle_zonas
    contexto["superficie_ha"] = round(
        sum(z["superficie_ha"] for z in poligonos), 2)

    # ── 4. Estadísticas zonales, a resolución completa ─────────────────
    estadisticas = zonas.estadisticas_zonales(capa_de_manejo["ruta_cog"],
                                              poligonos)

    # ── 5. Nitrógeno ───────────────────────────────────────────────────
    prescripcion = None
    medias_por_zona = {z: e["media"] for z, e in estadisticas.items() if e}

    if INDICE_DE_MANEJO in resultados and medias_por_zona:
        try:
            prescripcion, avisos = nitrogeno.recomendar(
                medias_por_zona, ndre_referencia)
            recomendaciones.extend(avisos)
        except DatoInsuficiente:
            # Sin franja de referencia se entrega lo que sí se puede, con su
            # nombre correcto: mapa de variabilidad, no prescripción.
            _, avisos = nitrogeno.mapa_variabilidad(medias_por_zona)
            recomendaciones.extend(avisos)

    contexto["prescripcion"] = prescripcion

    # ── 6. Biomasa, si hay puntos de campo ─────────────────────────────
    if puntos_biomasa:
        calibracion, avisos = biomasa.calibrar(puntos_biomasa)
        recomendaciones.extend(avisos)
        contexto["calibracion_biomasa"] = calibracion.como_dict()

    # ── 7. Exportación ─────────────────────────────────────────────────
    coleccion = exportar.coleccion(
        poligonos, prescripcion,
        insumo="urea" if prescripcion else "sin insumo",
        unidad="kg/ha" if prescripcion else "—",
        crs=datos_orto["crs"],
        metadatos={k: str(v) for k, v in metadatos.items()})

    directorio_prescripcion = os.path.join(directorio_salida, "prescripcion")
    os.makedirs(directorio_prescripcion, exist_ok=True)

    exportar.escribir_geojson(
        coleccion, os.path.join(directorio_prescripcion, "prescripcion.geojson"))

    try:
        from motor import exportar_shp
        exportar_shp.escribir(
            coleccion, os.path.join(directorio_prescripcion, "prescripcion"),
            wkt_crs=_wkt(ruta_canonica))
    except ImportError:
        recomendaciones.append(recomendacion.Recomendacion(
            texto=("No se exportó el shapefile porque falta pyshp. El GeoJSON sí "
                   "está, pero la mayoría de los monitores de maquinaria piden "
                   "shapefile."),
            fuente="Estado del entorno, no del cultivo",
            nivel="advertencia"))

    if prescripcion:
        resumen = exportar.resumen(coleccion)
        resumen["insumo"] = "urea"
        contexto["resumen_prescripcion"] = resumen

    # ── 8. Informe y manifiesto ────────────────────────────────────────
    contexto["recomendaciones"] = recomendacion.ordenar(recomendaciones)
    informe.escribir(contexto, os.path.join(directorio_salida, "informe.html"))

    man = manifiesto.Manifiesto(
        organizacion=metadatos.get("organizacion", "sin-organizacion"),
        campo=metadatos.get("campo", "sin-campo"),
        lote=metadatos.get("lote", "sin-lote"),
        fecha=contexto["fecha"],
        perfil_camara=p.id,
        calibracion=metadatos.get("calibracion", "ninguna"),
        comparable=contexto["comparable"],
        indices=sorted(resultados),
        salidas={
            "ortomosaico": ruta_canonica,
            "indices": directorio_indices,
            "prescripcion": directorio_prescripcion,
            "informe": os.path.join(directorio_salida, "informe.html"),
        },
        parametros={
            "k_zonas": k_zonas,
            "ndre_referencia": ndre_referencia,
            "indices_pedidos": pedidos,
            "indices_no_disponibles": rechazados,
            "sha256_entrada": datos_orto["sha256"],
        },
    )
    manifiesto.escribir(man, directorio_salida)

    print(f"\nListo en {time.time() - comienzo:.1f} s · motor v{VERSION}")
    print(f"  {len(resultados)} índices, {len(poligonos)} zonas, "
          f"{contexto['superficie_ha']} ha")
    if rechazados:
        print(f"  No se pudieron calcular: {', '.join(sorted(rechazados))}")
    if not contexto["comparable"]:
        print("  ⚠ Vuelo sin calibración radiométrica: NO comparable con "
              "otras fechas")
    print(f"  Salidas en {directorio_salida}\n")

    return 0


def _wkt(ruta):
    import rasterio
    with rasterio.open(ruta) as ds:
        return ds.crs.to_wkt() if ds.crs else None
