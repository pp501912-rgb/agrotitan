# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · PERCENTILES POR HISTOGRAMA
#
# p5 y p95 son columnas de la base que hasta ahora quedaban vacías. Son
# mejores descriptores que el mínimo y el máximo, que casi siempre son un
# píxel de ruido.
#
# Se comparan contra el cálculo exacto sobre la lista entera —que es lo que
# NO se puede hacer en producción, porque el ráster no entra en memoria— con
# la tolerancia del ancho de canasto, que el propio histograma declara.
# ═══════════════════════════════════════════════════════════════════════

import statistics
import unittest

from motor.dominio.estadistica import Histograma


def exacto(valores, p):
    return statistics.quantiles(valores, n=100, method="inclusive")[p - 1]


class PruebaExactitud(unittest.TestCase):

    def test_distribucion_uniforme(self):
        valores = [-1 + i * 0.0001 for i in range(20000)]
        h = Histograma(-1, 1).agregar_valores(valores)

        for p in (5, 25, 50, 75, 95):
            with self.subTest(percentil=p):
                self.assertAlmostEqual(h.percentil(p), exacto(valores, p),
                                       delta=h.ancho_canasto * 2)

    def test_ndvi_realista(self):
        # Un lote de verdad: casi todo entre 0,55 y 0,85, con cola baja de
        # suelo desnudo. Es donde el mínimo miente y el p5 no.
        valores = ([0.55 + (i % 300) * 0.001 for i in range(9000)]
                   + [0.05 + (i % 50) * 0.002 for i in range(300)])
        h = Histograma(-1, 1).agregar_valores(valores)

        self.assertAlmostEqual(h.percentil(5), exacto(valores, 5),
                               delta=h.ancho_canasto * 2)
        self.assertAlmostEqual(h.percentil(95), exacto(valores, 95),
                               delta=h.ancho_canasto * 2)
        # El mínimo es un valor de suelo; el p5 describe el lote.
        self.assertLess(min(valores), 0.1)
        self.assertGreater(h.percentil(5), 0.1)

    def test_el_error_esta_acotado_y_declarado(self):
        h = Histograma(-1, 1, canastos=2000)
        self.assertAlmostEqual(h.ancho_canasto, 0.001)

    def test_mas_canastos_menos_error(self):
        valores = [-1 + i * 0.0001 for i in range(20000)]
        grueso = Histograma(-1, 1, canastos=20).agregar_valores(valores)
        fino = Histograma(-1, 1, canastos=5000).agregar_valores(valores)

        real = exacto(valores, 50)
        self.assertLessEqual(abs(fino.percentil(50) - real),
                             abs(grueso.percentil(50) - real) + 1e-12)


class PruebaBordes(unittest.TestCase):

    def test_sin_datos(self):
        h = Histograma(-1, 1)
        self.assertIsNone(h.percentil(50))
        self.assertIsNone(h.resumen())

    def test_un_solo_valor(self):
        h = Histograma(-1, 1).agregar_valores([0.42])
        self.assertAlmostEqual(h.percentil(50), 0.42, delta=h.ancho_canasto)

    def test_todos_iguales(self):
        h = Histograma(-1, 1).agregar_valores([0.7] * 500)
        for p in (5, 50, 95):
            self.assertAlmostEqual(h.percentil(p), 0.7, delta=h.ancho_canasto)

    def test_valores_fuera_de_rango_se_amontonan_no_se_descartan(self):
        # Un índice puede salirse un poco de su rango teórico por ruido del
        # sensor. Descartarlo correría los percentiles hacia adentro sin que
        # nadie se entere; amontonarlo en el extremo los deja donde van.
        h = Histograma(0, 1)
        h.agregar_valores([-5.0] * 10 + [0.5] * 80 + [7.0] * 10)

        self.assertEqual(h.n, 100)
        self.assertLess(h.percentil(5), 0.1)
        self.assertGreater(h.percentil(95), 0.9)

    def test_percentil_invalido(self):
        with self.assertRaises(ValueError):
            Histograma(-1, 1).agregar_valores([0.5]).percentil(150)

    def test_rango_invertido_se_rechaza(self):
        with self.assertRaises(ValueError):
            Histograma(1, -1)


class PruebaCombinacionPorBloques(unittest.TestCase):
    """Es la vía real: la capa ráster suma el histograma de cada bloque."""

    def test_sumar_bloques_da_lo_mismo_que_todo_junto(self):
        valores = [(i % 977) / 977.0 for i in range(5000)]

        entero = Histograma(0, 1).agregar_valores(valores)

        por_bloques = Histograma(0, 1)
        for inicio in range(0, len(valores), 512):
            bloque = valores[inicio:inicio + 512]
            cuentas = [0] * por_bloques.canastos
            for v in bloque:
                cuentas[por_bloques._canasto(v)] += 1
            por_bloques.combinar_cuentas(cuentas)

        self.assertEqual(entero.n, por_bloques.n)
        self.assertEqual(entero.cuentas, por_bloques.cuentas)
        self.assertEqual(entero.percentil(50), por_bloques.percentil(50))

    def test_cantidad_de_canastos_distinta_se_rechaza(self):
        with self.assertRaises(ValueError):
            Histograma(0, 1, canastos=100).combinar_cuentas([0] * 50)


if __name__ == "__main__":
    unittest.main()
