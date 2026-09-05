# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · EVALUADOR DE FÓRMULAS
#
# El evaluador se prueba con floats, pero es el MISMO código que corre
# sobre arrays de numpy en raster/indices.py: numpy sobrecarga los
# operadores, así que el árbol se recorre igual. Estas pruebas verifican el
# camino de producción, no una maqueta.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor.dominio.errores import FormulaInvalida
from motor.dominio.formula import evaluar, nombres


class PruebaEvaluacion(unittest.TestCase):

    def test_ndvi_con_valores_conocidos(self):
        # Reflectancias típicas de vegetación sana: rojo bajo, NIR alto.
        r = evaluar("(nir - red) / (nir + red)", {"nir": 0.45, "red": 0.05})
        self.assertAlmostEqual(r, 0.80, places=10)

    def test_ndvi_de_suelo_desnudo_es_bajo(self):
        r = evaluar("(nir - red) / (nir + red)", {"nir": 0.25, "red": 0.22})
        self.assertLess(r, 0.10)

    def test_precedencia_de_operadores(self):
        # Si el evaluador se equivoca acá, todos los índices con constantes
        # (EVI, SAVI) dan mal en silencio.
        self.assertAlmostEqual(evaluar("2 + 3 * 4", {}), 14.0)
        self.assertAlmostEqual(evaluar("(2 + 3) * 4", {}), 20.0)

    def test_potencia_y_raiz(self):
        # MSAVI2 usa ** 0.5 como raíz cuadrada.
        self.assertAlmostEqual(evaluar("9 ** 0.5", {}), 3.0)

    def test_unario_negativo(self):
        self.assertAlmostEqual(evaluar("-nir + 1", {"nir": 0.4}), 0.6)

    def test_constantes_declaradas(self):
        # SAVI con L = 0,5
        r = evaluar("((nir - red) / (nir + red + L)) * (1 + L)",
                    {"nir": 0.45, "red": 0.05, "L": 0.5})
        self.assertAlmostEqual(r, ((0.40) / (1.0)) * 1.5, places=10)


class PruebaNombres(unittest.TestCase):

    def test_extrae_los_roles(self):
        self.assertEqual(nombres("(nir - rededge) / (nir + rededge)"),
                         {"nir", "rededge"})

    def test_incluye_constantes_declaradas(self):
        self.assertEqual(nombres("(nir - red) / (nir + red + L)"),
                         {"nir", "red", "L"})


class PruebaSeguridad(unittest.TestCase):
    """
    El catálogo de índices es un archivo editable. Si el evaluador usara
    eval(), editarlo sería ejecutar código en la máquina.
    """

    def test_rechaza_llamada_a_funcion(self):
        with self.assertRaises(FormulaInvalida):
            evaluar("__import__('os').system('ls')", {})

    def test_rechaza_acceso_a_atributos(self):
        with self.assertRaises(FormulaInvalida):
            evaluar("nir.__class__", {"nir": 0.4})

    def test_rechaza_indexado(self):
        with self.assertRaises(FormulaInvalida):
            evaluar("nir[0]", {"nir": [0.4]})

    def test_rechaza_comparaciones(self):
        with self.assertRaises(FormulaInvalida):
            evaluar("nir > red", {"nir": 0.4, "red": 0.1})

    def test_rechaza_nombre_no_disponible(self):
        with self.assertRaises(FormulaInvalida) as ctx:
            evaluar("(nir - blue) / (nir + blue)", {"nir": 0.4})
        self.assertIn("blue", str(ctx.exception))

    def test_rechaza_sintaxis_rota(self):
        with self.assertRaises(FormulaInvalida):
            evaluar("(nir - red", {"nir": 0.4, "red": 0.1})

    def test_rechaza_cadena_de_texto(self):
        with self.assertRaises(FormulaInvalida):
            evaluar("'hola'", {})


if __name__ == "__main__":
    unittest.main()
