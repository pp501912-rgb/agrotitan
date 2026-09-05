# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · MANIFIESTO
#
# El manifiesto es el seguro de vida del proyecto: si la base se pierde, se
# reconstruye leyendo estos archivos. Que escribir y releer devuelva
# exactamente lo mismo no es un detalle, es la garantía entera.
# ═══════════════════════════════════════════════════════════════════════

import os
import shutil
import tempfile
import unittest
from datetime import date

from motor.dominio import manifiesto as m
from motor.dominio.errores import ErrorDominio


def _valido(**cambios):
    datos = dict(
        organizacion="agrotitan",
        campo="la-esperanza",
        lote="lote-1",
        fecha=date(2026, 3, 15),
        perfil_camara="mavic3m",
        calibracion="panel+dls",
        comparable=True,
        indices=["NDVI", "NDRE"],
    )
    datos.update(cambios)
    return m.Manifiesto(**datos)


class PruebaIdaYVuelta(unittest.TestCase):

    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.dir)

    def test_escribir_y_releer_da_lo_mismo(self):
        original = _valido()
        m.escribir(original, self.dir)
        leido = m.leer(self.dir)
        self.assertEqual(original, leido)

    def test_la_fecha_sobrevive_como_texto_iso(self):
        m.escribir(_valido(), self.dir)
        self.assertEqual(m.leer(self.dir).fecha, "2026-03-15")

    def test_leer_sin_manifiesto_falla_claro(self):
        with self.assertRaises(ErrorDominio) as ctx:
            m.leer(self.dir)
        self.assertIn("manifiesto.json", str(ctx.exception))

    def test_recorrer_encuentra_todos(self):
        for lote in ("lote-1", "lote-2"):
            d = os.path.join(self.dir, "org", "campo", lote, "2026-03-15_abc")
            m.escribir(_valido(lote=lote), d)

        encontrados = m.recorrer(self.dir)
        self.assertEqual(len(encontrados), 2)
        self.assertEqual(sorted(x[1].lote for x in encontrados),
                         ["lote-1", "lote-2"])


class PruebaReglas(unittest.TestCase):

    def test_comparable_sin_calibracion_se_rechaza(self):
        # La misma regla que chk_comparable en la base, aplicada antes de
        # escribir el archivo.
        with self.assertRaises(ErrorDominio) as ctx:
            _valido(calibracion="ninguna", comparable=True)
        self.assertIn("números digitales", str(ctx.exception))

    def test_sin_calibracion_pero_no_comparable_es_valido(self):
        man = _valido(calibracion="ninguna", comparable=False)
        self.assertFalse(man.comparable)

    def test_falta_de_campo_obligatorio(self):
        with self.assertRaises(ErrorDominio) as ctx:
            _valido(lote=None)
        self.assertIn("lote", str(ctx.exception))


class PruebaConvencionDeRutas(unittest.TestCase):

    def test_la_ruta_sigue_la_convencion(self):
        ruta = m.ruta_de_vuelo("/datos", "agrotitan", "la-esperanza", "lote-1",
                               date(2026, 3, 15), "abc123")
        self.assertEqual(
            ruta,
            os.path.join("/datos", "agrotitan", "la-esperanza", "lote-1",
                         "2026-03-15_abc123"))


if __name__ == "__main__":
    unittest.main()
