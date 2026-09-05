# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · CALIBRACIÓN DE BIOMASA
#
# Criterio de aceptación: con puntos de R² conocido tiene que devolver ESE
# R², y con el R² ≈ 0,41 que reporta la bibliografía regional tiene que
# levantar la bandera de ajuste pobre.
#
# El R² esperado se calcula en la prueba por un camino distinto —el
# coeficiente de Pearson al cuadrado— para que un error en la fórmula del
# módulo no se copie a la prueba.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor.dominio import biomasa
from motor.dominio.errores import DatoInsuficiente, ErrorDominio


def r2_por_pearson(puntos):
    """R² calculado como el cuadrado del coeficiente de correlación."""
    n = len(puntos)
    xs = [p[0] for p in puntos]
    ys = [p[1] for p in puntos]
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in puntos)
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return (sxy / (sxx * syy) ** 0.5) ** 2


# Serie con dispersión, tomada de una secuencia fija para que la prueba sea
# reproducible: nada de números al azar en una prueba de regresión.
_RUIDO = [+180, -240, +95, -60, +310, -155, +40, -290, +205, -110,
          +75, -185, +260, -35, +120, -215, +150, -95, +45, -130,
          +225, -170, +85, -55, +195]


class PruebaCalibracion(unittest.TestCase):

    def test_ajuste_perfecto_da_r2_uno(self):
        puntos = [(0.30 + i * 0.02, 800 + i * 180.0) for i in range(20)]
        c, _ = biomasa.calibrar(puntos)

        self.assertAlmostEqual(c.r2, 1.0, places=9)
        self.assertAlmostEqual(c.rmse, 0.0, places=6)
        self.assertFalse(c.ajuste_pobre)
        # Con ajuste perfecto, la recta reproduce cualquier punto medido.
        self.assertAlmostEqual(c.estimar(0.30), 800.0, places=6)

    def test_r2_coincide_con_el_calculado_por_otro_camino(self):
        puntos = [(0.30 + i * 0.02, 800 + i * 180.0 + _RUIDO[i]) for i in range(25)]
        c, _ = biomasa.calibrar(puntos)
        self.assertAlmostEqual(c.r2, r2_por_pearson(puntos), places=9)

    def test_caso_de_la_bibliografia_r2_bajo_levanta_la_bandera(self):
        # Dispersión grande a propósito: es el caso frecuente en pasturas de
        # verano, donde la literatura regional reporta R² alrededor de 0,41.
        puntos = [(0.30 + i * 0.02, 1500 + i * 60.0 + _RUIDO[i] * 4.0)
                  for i in range(25)]
        c, avisos = biomasa.calibrar(puntos)

        esperado = r2_por_pearson(puntos)
        self.assertAlmostEqual(c.r2, esperado, places=9)
        self.assertLess(c.r2, biomasa.R2_MINIMO_ACEPTABLE)
        self.assertTrue(c.ajuste_pobre)

        # Y el aviso tiene que ser explícito sobre qué NO hacer con el número.
        advertencias = [a for a in avisos if a.nivel == "advertencia"]
        self.assertEqual(len(advertencias), 1)
        self.assertIn("carga animal", advertencias[0].texto)

    def test_pendiente_negativa_manda_a_revisar(self):
        # Más índice y menos pasto es al revés de lo esperado: casi siempre
        # es un problema de georreferenciación o de fecha de los puntos.
        puntos = [(0.30 + i * 0.02, 3000 - i * 100.0) for i in range(12)]
        _, avisos = biomasa.calibrar(puntos)
        self.assertIn("revisar_a_campo", [a.nivel for a in avisos])

    def test_avisa_cuando_hay_pocos_puntos(self):
        puntos = [(0.30 + i * 0.02, 800 + i * 180.0) for i in range(10)]
        _, avisos = biomasa.calibrar(puntos)
        textos = " ".join(a.texto for a in avisos)
        self.assertIn("20-25", textos)

    def test_estimacion_nunca_negativa(self):
        puntos = [(0.30 + i * 0.02, 800 + i * 180.0) for i in range(20)]
        c, _ = biomasa.calibrar(puntos)
        self.assertEqual(c.estimar(-5.0), 0.0)

    def test_detecta_extrapolacion(self):
        # Fuera del rango de índice que la calibración vio, el número es una
        # extrapolación y hay que poder saberlo.
        puntos = [(0.30 + i * 0.02, 800 + i * 180.0) for i in range(20)]
        c, _ = biomasa.calibrar(puntos)
        self.assertFalse(c.extrapola(0.50))
        self.assertTrue(c.extrapola(0.95))


class PruebaDatosInsuficientes(unittest.TestCase):

    def test_pocos_puntos_se_niega(self):
        with self.assertRaises(DatoInsuficiente) as ctx:
            biomasa.calibrar([(0.3, 900), (0.4, 1200), (0.5, 1500)])
        self.assertIn("20-25", str(ctx.exception))

    def test_todos_los_puntos_con_el_mismo_indice(self):
        # Prueba de regresión de un bug real: comparar la suma de cuadrados
        # contra cero no alcanza. Con 12 puntos en x = 0,4 el redondeo deja esa
        # suma en 3,7e-32, no en 0, y la pendiente salía absurda en silencio.
        with self.assertRaises(ErrorDominio) as ctx:
            biomasa.calibrar([(0.4, 900 + i * 10.0) for i in range(12)])
        self.assertIn("rango de biomasa", str(ctx.exception))

    def test_rango_angosto_avisa(self):
        # Muestrear solo la parte linda del potrero da una recta apoyada en un
        # punto, no anclada en un rango.
        puntos = [(0.500 + i * 0.001, 2000 + i * 90.0) for i in range(20)]
        _, avisos = biomasa.calibrar(puntos)
        textos = " ".join(a.texto for a in avisos)
        self.assertIn("angosto", textos)


if __name__ == "__main__":
    unittest.main()
