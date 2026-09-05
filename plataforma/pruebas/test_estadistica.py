# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · ESTADÍSTICA EN UNA PASADA
#
# Es la aritmética más delicada del motor: si combinar los bloques está mal,
# la media y el desvío de cada mapa de índice salen mal en silencio, y esos
# números van al informe y a la base.
#
# Se compara contra el cálculo directo sobre todos los valores juntos, que es
# lo que NO se puede hacer en producción porque el ráster no entra en memoria.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor.dominio.estadistica import Acumulador, resumir


def resumen_directo(valores):
    n = len(valores)
    media = sum(valores) / n
    varianza = sum((v - media) ** 2 for v in valores) / n
    return media, varianza ** 0.5


def por_bloques(bloques):
    """Combina bloques como lo hace la capa ráster."""
    acc = Acumulador()
    for bloque in bloques:
        n = len(bloque)
        media = sum(bloque) / n
        m2 = sum((v - media) ** 2 for v in bloque)
        acc.combinar(n, media, m2, min(bloque), max(bloque))
    return acc.resumen()


class PruebaCombinacion(unittest.TestCase):

    def test_un_solo_bloque(self):
        valores = [0.31, 0.55, 0.72, 0.48, 0.66]
        r = por_bloques([valores])
        media, desvio = resumen_directo(valores)
        self.assertAlmostEqual(r["media"], media, places=12)
        self.assertAlmostEqual(r["desvio"], desvio, places=12)

    def test_bloques_desparejos_dan_lo_mismo_que_todo_junto(self):
        # El caso real: los bloques del borde del ráster son más chicos.
        todos = [0.30 + (i % 37) * 0.01 for i in range(1000)]
        bloques = [todos[0:512], todos[512:1000], todos[1000:]]
        bloques = [b for b in bloques if b]

        r = por_bloques(bloques)
        media, desvio = resumen_directo(todos)

        self.assertEqual(r["n"], len(todos))
        self.assertAlmostEqual(r["media"], media, places=12)
        self.assertAlmostEqual(r["desvio"], desvio, places=12)

    def test_muchos_bloques_chicos(self):
        todos = [0.40 + (i % 13) * 0.005 for i in range(600)]
        bloques = [todos[i:i + 7] for i in range(0, len(todos), 7)]
        r = por_bloques(bloques)
        media, desvio = resumen_directo(todos)
        self.assertAlmostEqual(r["media"], media, places=12)
        self.assertAlmostEqual(r["desvio"], desvio, places=12)

    def test_precision_con_valores_muy_parecidos(self):
        # El caso que motiva usar este método: un NDVI tiene millones de
        # valores casi iguales. Sumar cuadrados de frente pierde dígitos.
        todos = [0.8000001 + (i % 3) * 1e-7 for i in range(5000)]
        bloques = [todos[i:i + 512] for i in range(0, len(todos), 512)]
        r = por_bloques(bloques)
        media, desvio = resumen_directo(todos)
        self.assertAlmostEqual(r["media"], media, places=13)
        self.assertAlmostEqual(r["desvio"], desvio, places=13)

    def test_minimo_y_maximo(self):
        r = por_bloques([[0.5, 0.9], [0.1, 0.4], [0.7]])
        self.assertEqual(r["minimo"], 0.1)
        self.assertEqual(r["maximo"], 0.9)

    def test_sin_datos_devuelve_none(self):
        self.assertIsNone(Acumulador().resumen())
        self.assertIsNone(resumir([]))

    def test_bloque_vacio_no_rompe(self):
        acc = Acumulador()
        acc.combinar(0, 0.0, 0.0)
        self.assertIsNone(acc.resumen())

    def test_un_solo_valor(self):
        r = resumir([0.42])
        self.assertEqual(r["n"], 1)
        self.assertEqual(r["media"], 0.42)
        self.assertEqual(r["desvio"], 0.0)


class PruebaEscalaDeAlmacenamiento(unittest.TestCase):
    """
    La escala con la que cada índice se guarda en int16. Si se equivoca, el
    valor desborda y un vigor alto se guarda como número negativo.
    """

    def test_indices_normalizados_usan_diez_mil(self):
        from motor.dominio.catalogo import escala_de_almacenamiento as e
        self.assertEqual(e((-1.0, 1.0)), 10000)

    def test_indices_de_rango_grande_bajan_la_escala(self):
        from motor.dominio.catalogo import escala_de_almacenamiento as e
        # CIre llega a 15: 15 x 10.000 no entra en int16.
        self.assertEqual(e((0.0, 15.0)), 1000)

    def test_ningun_indice_del_catalogo_desborda(self):
        from motor.dominio.catalogo import TECHO_INT16, cargar
        for nombre, indice in cargar().items():
            with self.subTest(indice=nombre):
                extremo = max(abs(indice.rango[0]), abs(indice.rango[1]))
                self.assertLessEqual(extremo * indice.escala, TECHO_INT16)


if __name__ == "__main__":
    unittest.main()
