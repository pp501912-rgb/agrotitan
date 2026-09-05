# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · RECONSTRUCCIÓN DESDE LOS MANIFIESTOS
#
# El LEEME dice que si la base se pierde, un script la repuebla leyendo las
# carpetas. Un respaldo que nadie probó restaurar no es un respaldo: acá se
# prueba, sobre un árbol de manifiestos armado a mano.
# ═══════════════════════════════════════════════════════════════════════

import os
import shutil
import tempfile
import unittest

from motor import reconstruir
from motor.dominio import manifiesto as m

_CUADRADO = {"type": "Polygon",
             "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]}


def _manifiesto(lote="Lote 1", sha="a" * 64, completo=True, **cambios):
    datos = dict(
        organizacion="prueba", campo="La Esperanza", lote=lote,
        fecha="2026-03-15", perfil_camara="mavic3m",
        calibracion="panel+dls", comparable=True,
        vuelo_id="44444444-4444-4444-4444-444444444444" if completo else None,
        geo={"crs": "EPSG:32721", "epsg_utm": 32721,
             "footprint": _CUADRADO} if completo else {},
        parametros={"sha256_entrada": sha},
    )
    datos.update(cambios)
    return m.Manifiesto(**datos)


class PruebaPlanificacion(unittest.TestCase):

    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.dir)

    def _escribir(self, manifiesto, sub):
        ruta = os.path.join(self.dir, "prueba", "campo", sub)
        m.escribir(manifiesto, ruta)
        return ruta

    def test_encuentra_todos_los_vuelos(self):
        self._escribir(_manifiesto("Lote 1", "a" * 64), "l1/2026-03-15_abc")
        self._escribir(_manifiesto("Lote 2", "b" * 64), "l2/2026-03-15_def")

        hallazgos = reconstruir.planificar(self.dir)

        self.assertEqual(len(hallazgos), 2)
        self.assertTrue(all(h.estado == "listo" for h in hallazgos))
        self.assertTrue(all(h.plan for h in hallazgos))

    def test_es_idempotente(self):
        # Correr la reconstrucción dos veces no puede duplicar nada.
        self._escribir(_manifiesto("Lote 1", "a" * 64), "l1/2026-03-15_abc")
        self._escribir(_manifiesto("Lote 2", "b" * 64), "l2/2026-03-15_def")

        hallazgos = reconstruir.planificar(self.dir, hashes_presentes={"a" * 64})

        estados = sorted(h.estado for h in hallazgos)
        self.assertEqual(estados, ["listo", "ya_estaba"])
        ya = next(h for h in hallazgos if h.estado == "ya_estaba")
        self.assertIsNone(ya.plan)

    def test_un_manifiesto_viejo_se_marca_incompleto_y_dice_qué_le_falta(self):
        # Los manifiestos anteriores a esta versión no tienen vuelo_id ni
        # huella: describen el vuelo pero no alcanzan para rehacer las filas.
        self._escribir(_manifiesto("Lote 3", "c" * 64, completo=False),
                       "l3/2026-03-15_ghi")

        hallazgos = reconstruir.planificar(self.dir)

        self.assertEqual(hallazgos[0].estado, "incompleto")
        self.assertIn("vuelo_id", hallazgos[0].motivo)
        self.assertIn("geo.footprint", hallazgos[0].motivo)
        self.assertIsNone(hallazgos[0].plan)

    def test_el_plan_conserva_el_identificador_del_vuelo(self):
        # Si reconstruir inventara un id nuevo, la carpeta en disco dejaría
        # de apuntar a la fila de la base.
        man = _manifiesto()
        self._escribir(man, "l1/2026-03-15_abc")

        hallazgos = reconstruir.planificar(self.dir)
        vuelo = next(o for o in hallazgos[0].plan if o.nombre == "insertar_vuelo")

        self.assertEqual(vuelo.parametros[0], man.vuelo_id)

    def test_arbol_vacio(self):
        self.assertEqual(reconstruir.planificar(self.dir), [])


class PruebaInforme(unittest.TestCase):

    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.dir)

    def test_avisa_que_los_lotes_son_provisorios(self):
        # El lote se crea con la huella del vuelo, que NO es el lote relevado.
        # Callarlo dejaría una superficie inventada como si fuera un dato.
        m.escribir(_manifiesto(), os.path.join(self.dir, "a", "b", "c"))
        texto = reconstruir.informe(reconstruir.planificar(self.dir))

        self.assertIn("HUELLA DEL VUELO", texto)
        self.assertIn("provisoria", texto)

    def test_lista_los_incompletos(self):
        m.escribir(_manifiesto("Lote X", completo=False),
                   os.path.join(self.dir, "a", "b", "c"))
        texto = reconstruir.informe(reconstruir.planificar(self.dir))

        self.assertIn("INCOMPLETO", texto)
        self.assertIn("Lote X", texto)


class PruebaManifiestoReconstruible(unittest.TestCase):

    def test_completo_es_reconstruible(self):
        self.assertTrue(_manifiesto().reconstruible)

    def test_sin_vuelo_id_no_lo_es(self):
        self.assertFalse(_manifiesto(vuelo_id=None).reconstruible)

    def test_sin_huella_no_lo_es(self):
        self.assertFalse(_manifiesto(geo={"crs": "EPSG:32721"}).reconstruible)


if __name__ == "__main__":
    unittest.main()
