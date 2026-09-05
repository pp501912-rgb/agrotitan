# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · RECOMENDACIONES
#
# Criterio de aceptación: sin fuente, el objeto no se construye. La base ya
# lo impide con un NOT NULL, pero fallar acá hace que el error aparezca
# donde se escribió la regla.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor.dominio.errores import ErrorDominio
from motor.dominio.recomendacion import Recomendacion, ordenar
from motor.version import VERSION


class PruebaFuenteObligatoria(unittest.TestCase):

    def test_sin_fuente_no_se_construye(self):
        with self.assertRaises(ErrorDominio) as ctx:
            Recomendacion(texto="Fertilizar la zona 3", fuente=None)
        self.assertIn("opinión", str(ctx.exception))

    def test_fuente_vacia_tampoco(self):
        with self.assertRaises(ErrorDominio):
            Recomendacion(texto="Fertilizar", fuente="   ")

    def test_texto_vacio_tampoco(self):
        with self.assertRaises(ErrorDominio):
            Recomendacion(texto="", fuente="Alguien (2020)")


class PruebaContenido(unittest.TestCase):

    def test_guarda_version_del_motor(self):
        # Sin esto, una recomendación de hace dos campañas no se reproduce.
        r = Recomendacion(texto="Aplicar 60 kg N/ha", fuente="Holland y Schepers (2010)")
        self.assertEqual(r.version_motor, VERSION)

    def test_nivel_invalido_se_rechaza(self):
        with self.assertRaises(ErrorDominio):
            Recomendacion(texto="x", fuente="y", nivel="urgentisimo")

    def test_como_dict_lleva_todo_lo_que_va_a_la_base(self):
        r = Recomendacion(
            texto="Aplicar 60 kg N/ha en la zona 2",
            fuente="Holland y Schepers (2010)",
            nivel="sugerencia",
            umbral_aplicado="SI < 0.95",
            supuestos={"dosis_maxima_kg_ha": 120},
            medicion={"ndre_zona": 0.38},
        )
        d = r.como_dict()
        for clave in ("texto", "fuente", "nivel", "umbral_aplicado",
                      "supuestos", "medicion", "version_motor"):
            self.assertIn(clave, d)


class PruebaOrden(unittest.TestCase):

    def test_lo_que_hay_que_mirar_primero_va_primero(self):
        f = "Fuente cualquiera (2020)"
        recomendaciones = [
            Recomendacion("a", f, nivel="informativo"),
            Recomendacion("b", f, nivel="revisar_a_campo"),
            Recomendacion("c", f, nivel="sugerencia"),
            Recomendacion("d", f, nivel="advertencia"),
        ]
        self.assertEqual([r.texto for r in ordenar(recomendaciones)],
                         ["b", "d", "c", "a"])


if __name__ == "__main__":
    unittest.main()
