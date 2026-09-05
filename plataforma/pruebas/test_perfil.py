# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · PERFILES DE CÁMARA
#
# El agnosticismo de sensor se cae si un YAML mal escrito entra sin chistar.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor.dominio import perfil
from motor.dominio.errores import PerfilInvalido


class PruebaCargaDeTodosLosPerfiles(unittest.TestCase):

    def test_todos_los_perfiles_del_repo_cargan(self):
        ids = perfil.listar()
        self.assertGreaterEqual(len(ids), 7)
        for pid in ids:
            with self.subTest(perfil=pid):
                p = perfil.cargar(pid)
                self.assertTrue(p.bandas)
                for b in p.bandas:
                    self.assertIn(b.rol, perfil.ROLES_VALIDOS)

    def test_mavic3m_no_tiene_azul(self):
        # Es el hecho que sostiene el caso de prueba del catálogo.
        p = perfil.cargar("mavic3m")
        self.assertFalse(p.tiene("blue"))
        self.assertEqual(p.roles, {"green", "red", "rededge", "nir"})

    def test_rededge_p_tiene_las_cinco_bandas(self):
        p = perfil.cargar("rededge-p")
        self.assertEqual(p.roles, {"blue", "green", "red", "rededge", "nir"})

    def test_la_pancromatica_no_cuenta_como_rol_espectral(self):
        # Existe en el ortomosaico pero no participa de ningún índice.
        p = perfil.cargar("rededge-p")
        self.assertTrue(p.tiene("pan"))
        self.assertNotIn("pan", p.roles)

    def test_la_termica_del_altum_tampoco_es_un_rol_espectral(self):
        # Prueba de regresión: la ingesta trataba la térmica como una banda
        # más y la escribía escalada x10.000. Peor todavía, la validación de
        # rango la habría visto fuera de escala y habría RECHAZADO el vuelo
        # entero de un Altum, que es un equipo perfectamente válido.
        p = perfil.cargar("altum")
        self.assertTrue(p.tiene("lwir"))
        self.assertNotIn("lwir", p.roles)
        self.assertEqual(p.roles, {"blue", "green", "red", "rededge", "nir"})

    def test_orden_de_banda(self):
        p = perfil.cargar("mavic3m")
        self.assertEqual(p.orden_de("nir"), 4)
        with self.assertRaises(PerfilInvalido):
            p.orden_de("blue")


class PruebaValidacion(unittest.TestCase):

    def _base(self, bandas):
        return {"id": "x", "marca": "m", "modelo": "mm", "bandas": bandas}

    def test_rechaza_rol_inexistente(self):
        with self.assertRaises(PerfilInvalido) as ctx:
            perfil.desde_dict(self._base(
                [{"orden": 1, "rol": "infrarrojo", "lambda_nm": 800}]))
        self.assertIn("infrarrojo", str(ctx.exception))

    def test_rechaza_rol_duplicado(self):
        # Dos bandas con el mismo rol harían ambiguo el mapa rol -> banda.
        with self.assertRaises(PerfilInvalido):
            perfil.desde_dict(self._base([
                {"orden": 1, "rol": "nir", "lambda_nm": 800},
                {"orden": 2, "rol": "nir", "lambda_nm": 860},
            ]))

    def test_rechaza_orden_duplicado(self):
        with self.assertRaises(PerfilInvalido):
            perfil.desde_dict(self._base([
                {"orden": 1, "rol": "nir", "lambda_nm": 800},
                {"orden": 1, "rol": "red", "lambda_nm": 660},
            ]))

    def test_rechaza_perfil_sin_bandas(self):
        with self.assertRaises(PerfilInvalido):
            perfil.desde_dict(self._base([]))

    def test_rechaza_falta_de_clave(self):
        with self.assertRaises(PerfilInvalido):
            perfil.desde_dict({"id": "x", "marca": "m", "bandas": []})

    def test_perfil_inexistente_lista_los_disponibles(self):
        with self.assertRaises(PerfilInvalido) as ctx:
            perfil.cargar("camara-que-no-existe")
        self.assertIn("mavic3m", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
