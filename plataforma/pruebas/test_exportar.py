# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · EXPORTACIÓN DE LA PRESCRIPCIÓN
#
# El mapa de prescripción es lo único que la máquina lee. Si sale mal, todo
# el trabajo anterior no existió.
# ═══════════════════════════════════════════════════════════════════════

import json
import os
import shutil
import tempfile
import unittest

from motor.dominio import exportar
from motor.dominio.errores import ErrorDominio

_CUADRADO = {"type": "Polygon",
             "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]}


def _poligonos():
    return [
        {"zona": 1, "geometry": _CUADRADO, "superficie_ha": 10.0},
        {"zona": 2, "geometry": _CUADRADO, "superficie_ha": 5.0},
    ]


def _prescripcion():
    return {
        1: {"dosis_kg_ha": 0.0, "indice_suficiencia": 0.97,
            "justificacion": "SI = 0.97 >= 0.95: la zona está suficiente"},
        2: {"dosis_kg_ha": 60.0, "indice_suficiencia": 0.82,
            "justificacion": "SI = 0.82: deficiencia proporcional"},
    }


class PruebaColeccion(unittest.TestCase):

    def test_estructura_geojson_valida(self):
        c = exportar.coleccion(_poligonos(), _prescripcion(), "urea", "kg/ha")
        self.assertEqual(c["type"], "FeatureCollection")
        self.assertEqual(len(c["features"]), 2)
        for rasgo in c["features"]:
            self.assertEqual(rasgo["type"], "Feature")
            self.assertIn("geometry", rasgo)

    def test_los_nombres_de_campo_entran_en_un_shapefile(self):
        # El shapefile trunca a 10 caracteres sin avisar. Si un nombre se pasa,
        # el GeoJSON y el shapefile terminan con columnas distintas.
        for nombre in exportar.NOMBRES_CAMPOS:
            with self.subTest(campo=nombre):
                self.assertLessEqual(len(nombre), 10)

    def test_las_propiedades_tienen_todos_los_campos(self):
        c = exportar.coleccion(_poligonos(), _prescripcion(), "urea", "kg/ha")
        for rasgo in c["features"]:
            self.assertEqual(set(rasgo["properties"]), set(exportar.NOMBRES_CAMPOS))

    def test_los_metadatos_viajan_con_el_archivo(self):
        c = exportar.coleccion(_poligonos(), _prescripcion(), "urea", "kg/ha",
                               metadatos={"vuelo": "abc"})
        self.assertIn("version_motor", c["metadata"])
        self.assertEqual(c["metadata"]["vuelo"], "abc")

    def test_el_motivo_se_recorta_al_limite_del_dbf(self):
        largo = {1: {"dosis_kg_ha": 10.0, "justificacion": "x" * 400}}
        c = exportar.coleccion(_poligonos()[:1], largo, "urea", "kg/ha")
        self.assertEqual(len(c["features"][0]["properties"]["motivo"]), 254)

    def test_exportar_solo_zonificacion(self):
        c = exportar.coleccion(_poligonos(), None, "sin insumo", "—")
        self.assertIsNone(c["features"][0]["properties"]["dosis"])

    def test_sin_poligonos_falla(self):
        with self.assertRaises(ErrorDominio):
            exportar.coleccion([], {}, "urea", "kg/ha")


class PruebaResumen(unittest.TestCase):

    def test_total_de_insumo_a_mano(self):
        # Zona 2: 60 kg/ha sobre 5 ha = 300 kg. Zona 1 no lleva nada.
        c = exportar.coleccion(_poligonos(), _prescripcion(), "urea", "kg/ha")
        r = exportar.resumen(c)
        self.assertEqual(r["insumo_total"], 300.0)
        self.assertEqual(r["superficie_total_ha"], 15.0)
        self.assertEqual(r["zonas_con_dosis"], 1)
        # 300 kg sobre 15 ha = 20 kg/ha de dosis media ponderada.
        self.assertEqual(r["dosis_media_ponderada"], 20.0)


class PruebaArchivo(unittest.TestCase):

    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.dir)

    def test_el_geojson_escrito_se_relee(self):
        c = exportar.coleccion(_poligonos(), _prescripcion(), "urea", "kg/ha")
        ruta = os.path.join(self.dir, "prescripcion.geojson")
        exportar.escribir_geojson(c, ruta)

        with open(ruta, encoding="utf-8") as f:
            leido = json.load(f)

        self.assertEqual(leido, c)


if __name__ == "__main__":
    unittest.main()
