# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · CATÁLOGO Y DISPONIBILIDAD POR CÁMARA
#
# El criterio de aceptación central del motor: con un Mavic 3M, los índices
# que necesitan azul tienen que quedar DESHABILITADOS Y REPORTADOS, nunca
# calculados con una banda sustituta.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor.dominio import catalogo, perfil
from motor.dominio.errores import IndiceNoDisponible


class PruebaCatalogo(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.catalogo = catalogo.cargar()

    def test_los_indices_basicos_estan(self):
        for nombre in ("NDVI", "NDRE", "GNDVI", "OSAVI", "SAVI", "MSAVI2",
                       "EVI", "EVI2", "ARVI", "MCARI", "CIre", "CIg", "NDWI"):
            self.assertIn(nombre, self.catalogo)

    def test_todos_declaran_fuente(self):
        # Un índice sin cita no entra: es la misma regla que las recomendaciones.
        for nombre, indice in self.catalogo.items():
            with self.subTest(indice=nombre):
                self.assertTrue(indice.fuente.strip())

    def test_roles_requeridos_se_deducen_de_la_formula(self):
        self.assertEqual(self.catalogo["NDRE"].roles_requeridos, {"nir", "rededge"})
        self.assertEqual(self.catalogo["EVI"].roles_requeridos,
                         {"nir", "red", "blue"})
        # SAVI declara L como constante, así que L no es un rol requerido.
        self.assertEqual(self.catalogo["SAVI"].roles_requeridos, {"nir", "red"})

    def test_valores_conocidos(self):
        bandas = {"nir": 0.45, "red": 0.05, "green": 0.10,
                  "rededge": 0.20, "blue": 0.03}
        self.assertAlmostEqual(self.catalogo["NDVI"].calcular(bandas), 0.80)
        self.assertAlmostEqual(self.catalogo["NDRE"].calcular(bandas), 0.384615, places=5)
        self.assertAlmostEqual(self.catalogo["GNDVI"].calcular(bandas), 0.636364, places=5)
        self.assertAlmostEqual(self.catalogo["CIre"].calcular(bandas), 1.25)

    def test_indices_dentro_del_rango_declarado(self):
        bandas = {"nir": 0.45, "red": 0.05, "green": 0.10,
                  "rededge": 0.20, "blue": 0.03}
        for nombre, indice in self.catalogo.items():
            with self.subTest(indice=nombre):
                v = indice.calcular(bandas)
                self.assertGreaterEqual(v, indice.rango[0] - 1e-9)
                self.assertLessEqual(v, indice.rango[1] + 1e-9)


class PruebaDisponibilidad(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.catalogo = catalogo.cargar()

    def test_mavic3m_deshabilita_los_que_necesitan_azul(self):
        p = perfil.cargar("mavic3m")
        disponibles, no_disponibles = catalogo.disponibilidad(p, self.catalogo)

        # Sin banda azul: EVI y ARVI quedan afuera.
        self.assertIn("EVI", no_disponibles)
        self.assertIn("ARVI", no_disponibles)
        self.assertNotIn("EVI", disponibles)

        # Y el motivo tiene que nombrar la banda que falta, no un código.
        self.assertIn("blue", no_disponibles["EVI"])

    def test_mavic3m_si_puede_mcari(self):
        # MCARI usa borde rojo, rojo y verde: NO necesita azul. Es un error
        # frecuente creer que sí, y el catálogo tiene que reflejar la fórmula
        # publicada, no la intuición.
        p = perfil.cargar("mavic3m")
        disponibles, _ = catalogo.disponibilidad(p, self.catalogo)
        self.assertIn("MCARI", disponibles)
        self.assertIn("NDRE", disponibles)

    def test_rededge_p_puede_todos(self):
        p = perfil.cargar("rededge-p")
        _, no_disponibles = catalogo.disponibilidad(p, self.catalogo)
        self.assertEqual(no_disponibles, {})

    def test_calcular_un_indice_no_disponible_falla(self):
        # No devuelve un número aproximado: se niega.
        bandas = {"nir": 0.45, "red": 0.05, "green": 0.10, "rededge": 0.20}
        with self.assertRaises(IndiceNoDisponible) as ctx:
            self.catalogo["EVI"].calcular(bandas)
        self.assertIn("blue", str(ctx.exception))

    def test_ofrece_alternativa_publicada(self):
        # El EVI2 existe justamente para sensores sin azul: ofrecerlo NO es
        # sustituir bandas, es usar otro índice publicado.
        p = perfil.cargar("mavic3m")
        alts = catalogo.alternativas("EVI", p, self.catalogo)
        self.assertIn("EVI2", alts)

    def test_sequoia_igual_que_mavic(self):
        p = perfil.cargar("sequoia")
        _, no_disponibles = catalogo.disponibilidad(p, self.catalogo)
        self.assertEqual(set(no_disponibles), {"EVI", "ARVI"})


if __name__ == "__main__":
    unittest.main()
