# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · PIPELINE COMPLETO SOBRE EL ORTOMOSAICO SINTÉTICO
#
# ⚠ ESTAS PRUEBAS NO SE EJECUTARON TODAVÍA. Se escribieron sin poder
#   instalar numpy ni rasterio. Son el primer paso a correr en la PC de
#   destino, y lo esperable es que algo falle: para eso están.
#
# Se saltean solas si falta el entorno, así que la suite del dominio sigue
# corriendo en cualquier máquina.
# ═══════════════════════════════════════════════════════════════════════

import os
import shutil
import tempfile
import unittest

try:
    import numpy  # noqa: F401
    import rasterio  # noqa: F401
    HAY_ENTORNO = True
except ImportError:
    HAY_ENTORNO = False

RAZON = ("necesita numpy y rasterio: conda env create -f entorno.yml")


@unittest.skipUnless(HAY_ENTORNO, RAZON)
class PruebaPipeline(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from datos.generar_sintetico import generar
        cls.dir = tempfile.mkdtemp()
        cls.orto = generar(os.path.join(cls.dir, "orto.tif"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir)

    def test_ingesta_reconoce_reflectancia(self):
        from motor.dominio import perfil
        from motor.raster import ingesta

        informe = ingesta.inspeccionar(self.orto, perfil.cargar("generico-5bandas"))
        self.assertTrue(informe["parece_reflectancia"])
        self.assertEqual(informe["n_bandas"], 5)

    def test_ingesta_rechaza_numeros_digitales(self):
        # Un ortomosaico sin calibrar tiene valores muy fuera del rango de
        # reflectancia. Tiene que negarse, no seguir de largo.
        import numpy as np
        import rasterio

        from motor.dominio import perfil
        from motor.dominio.errores import ErrorDominio
        from motor.raster import ingesta

        ruta = os.path.join(self.dir, "sin_calibrar.tif")
        with rasterio.open(self.orto) as origen:
            perfil_salida = origen.profile.copy()
            with rasterio.open(ruta, "w", **perfil_salida) as destino:
                for i in range(1, origen.count + 1):
                    # x50: sale de cualquier rango de reflectancia posible.
                    datos = np.clip(origen.read(i).astype(np.int32) * 50, 0, 65535)
                    destino.write(datos.astype(np.uint16), i)

        with self.assertRaises(ErrorDominio) as ctx:
            ingesta.convertir(ruta, os.path.join(self.dir, "x.tif"),
                              perfil.cargar("generico-5bandas"))
        self.assertIn("números digitales", str(ctx.exception))

    def test_indices_en_rango_fisico(self):
        from motor.dominio import perfil
        from motor.raster import indices, ingesta

        canonico = os.path.join(self.dir, "canonico.tif")
        ingesta.convertir(self.orto, canonico, perfil.cargar("generico-5bandas"))

        resultados, rechazados = indices.calcular(
            canonico, ["NDVI", "NDRE", "GNDVI"],
            perfil.cargar("generico-5bandas"),
            os.path.join(self.dir, "indices"))

        self.assertEqual(rechazados, {})
        for nombre, fila in resultados.items():
            with self.subTest(indice=nombre):
                self.assertTrue(os.path.exists(fila["ruta_cog"]))
                self.assertGreaterEqual(fila["minimo"], -1.0)
                self.assertLessEqual(fila["maximo"], 1.0)
                # El sintético tiene vegetación: el NDVI medio no puede ser bajo.
                if nombre == "NDVI":
                    self.assertGreater(fila["media"], 0.4)

    def test_mavic3m_no_calcula_evi(self):
        # El criterio de aceptación del agnosticismo de sensor, sobre archivos
        # de verdad y no solo sobre el catálogo.
        from motor.dominio import perfil
        from motor.raster import indices, ingesta

        p = perfil.cargar("mavic3m")
        canonico = os.path.join(self.dir, "canonico_4b.tif")
        ingesta.convertir(self.orto, canonico, p)

        resultados, rechazados = indices.calcular(
            canonico, ["NDVI", "EVI"], p, os.path.join(self.dir, "indices_4b"))

        self.assertIn("NDVI", resultados)
        self.assertIn("EVI", rechazados)
        self.assertIn("blue", rechazados["EVI"])
        self.assertIn("EVI2", rechazados["EVI"])      # ofrece la alternativa

    def test_zonas_encuentran_la_mancha_degradada(self):
        from motor.dominio import perfil
        from motor.raster import indices, ingesta, zonas

        canonico = os.path.join(self.dir, "canonico_z.tif")
        ingesta.convertir(self.orto, canonico, perfil.cargar("generico-5bandas"))
        resultados, _ = indices.calcular(
            canonico, ["NDVI"], perfil.cargar("generico-5bandas"),
            os.path.join(self.dir, "indices_z"))

        # El sintético es chico: se zonifica a 0,5 m y con superficie mínima
        # baja, si no queda todo en una sola zona.
        poligonos, detalle = zonas.zonificar(
            [resultados["NDVI"]["ruta_cog"]], k=3,
            resolucion_m=0.5, superficie_minima_ha=0.005)

        self.assertEqual(detalle["k"], 3)
        self.assertGreaterEqual(len({p["zona"] for p in poligonos}), 2)
        self.assertTrue(all(p["superficie_ha"] > 0 for p in poligonos))

    def test_pipeline_completo_deja_todas_las_salidas(self):
        from motor import canalizacion

        salida = os.path.join(self.dir, "corrida")
        codigo = canalizacion.procesar(
            ruta_ortomosaico=self.orto,
            id_perfil="generico-5bandas",
            directorio_salida=salida,
            indices=["NDVI", "NDRE"],
            k_zonas=3,
            ndre_referencia=0.55,
            metadatos={"organizacion": "prueba", "campo": "c", "lote": "l",
                       "fecha": "2026-03-15", "calibracion": "panel+dls"})

        self.assertEqual(codigo, 0)
        for relativa in ("ortomosaico.tif", "indices/ndvi.tif", "indices/ndre.tif",
                         "informe.html", "manifiesto.json",
                         "prescripcion/prescripcion.geojson"):
            with self.subTest(salida=relativa):
                self.assertTrue(os.path.exists(os.path.join(salida, relativa)))

    def test_vuelo_sin_calibracion_queda_marcado(self):
        from motor import canalizacion
        from motor.dominio import manifiesto

        salida = os.path.join(self.dir, "corrida_sin_cal")
        canalizacion.procesar(
            ruta_ortomosaico=self.orto,
            id_perfil="generico-5bandas",
            directorio_salida=salida,
            indices=["NDVI", "NDRE"],
            k_zonas=2,
            metadatos={"organizacion": "prueba", "campo": "c", "lote": "l",
                       "fecha": "2026-03-15", "calibracion": "ninguna"})

        man = manifiesto.leer(salida)
        self.assertFalse(man.comparable)

        with open(os.path.join(salida, "informe.html"), encoding="utf-8") as f:
            self.assertIn("no se pueden comparar", f.read())


@unittest.skipUnless(HAY_ENTORNO, RAZON)
class PruebaMemoria(unittest.TestCase):
    """
    El criterio de aceptación de memoria: el pipeline no puede pasar de 4 GB
    de pico en una PC de 16 GB.
    """

    def test_pico_de_memoria_bajo_control(self):
        try:
            import psutil
        except ImportError:
            self.skipTest("necesita psutil")

        import tempfile as tf

        from datos.generar_sintetico import generar
        from motor import canalizacion

        proceso = psutil.Process()
        antes = proceso.memory_info().rss

        with tf.TemporaryDirectory() as d:
            orto = generar(os.path.join(d, "o.tif"))
            canalizacion.procesar(
                ruta_ortomosaico=orto, id_perfil="generico-5bandas",
                directorio_salida=os.path.join(d, "s"),
                indices=["NDVI"], k_zonas=2,
                metadatos={"calibracion": "panel"})

        crecimiento_mb = (proceso.memory_info().rss - antes) / 1024 / 1024
        print(f"\n  Crecimiento de memoria: {crecimiento_mb:.0f} MB")
        self.assertLess(crecimiento_mb, 4096)


if __name__ == "__main__":
    unittest.main()
