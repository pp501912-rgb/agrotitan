# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · FORRAJE Y CARGA ANIMAL
#
# Cuentas simples, verificadas a mano. Si estas se rompen, el ganadero
# mueve la hacienda al potrero equivocado.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor.dominio import carga
from motor.dominio.errores import ErrorDominio


class PruebaForraje(unittest.TestCase):

    def test_forraje_utilizable_a_mano(self):
        # 2800 - 1200 de remanente = 1600 kg MS/ha
        # 1600 x 0,60 de eficiencia = 960 kg MS/ha aprovechables
        # 960 x 25 ha = 24.000 kg MS
        self.assertAlmostEqual(carga.forraje_utilizable(2800, 25), 24000.0)

    def test_por_debajo_del_remanente_no_hay_nada_utilizable(self):
        self.assertEqual(carga.forraje_utilizable(1000, 25), 0.0)

    def test_consumo_diario_a_mano(self):
        # 120 cabezas x 420 kg x 2,8 % = 1411,2 kg MS/día
        self.assertAlmostEqual(carga.consumo_diario(120, 420), 1411.2, places=6)

    def test_dias_de_pastoreo_a_mano(self):
        # 24.000 / 1411,2 = 17,0 días
        dias, detalle, _ = carga.dias_de_pastoreo(2800, 25, 120, 420)
        self.assertAlmostEqual(dias, 17.0, places=1)
        self.assertAlmostEqual(detalle["carga_instantanea_cab_ha"], 4.8)

    def test_los_supuestos_viajan_con_el_resultado(self):
        # Sin esto, el número no se puede discutir con nadie.
        _, detalle, _ = carga.dias_de_pastoreo(2800, 25, 120, 420)
        self.assertEqual(detalle["supuestos"]["eficiencia_cosecha"], 0.60)
        self.assertEqual(detalle["supuestos"]["remanente_kg_ms_ha"], 1200.0)

    def test_supuestos_configurables_cambian_el_resultado(self):
        conservador = carga.Supuestos(eficiencia_cosecha=0.45,
                                      remanente_kg_ms_ha=1500.0)
        dias, _, _ = carga.dias_de_pastoreo(2800, 25, 120, 420, conservador)
        base, _, _ = carga.dias_de_pastoreo(2800, 25, 120, 420)
        self.assertLess(dias, base)


class PruebaAvisos(unittest.TestCase):

    def test_potrero_por_debajo_del_remanente_avisa(self):
        _, _, avisos = carga.dias_de_pastoreo(900, 25, 120, 420)
        self.assertEqual(avisos[0].nivel, "advertencia")
        self.assertIn("rebrote", avisos[0].texto)

    def test_menos_de_un_dia_avisa(self):
        _, _, avisos = carga.dias_de_pastoreo(1250, 1, 200, 450)
        self.assertEqual(avisos[0].nivel, "advertencia")

    def test_caso_normal_es_informativo(self):
        _, _, avisos = carga.dias_de_pastoreo(2800, 25, 120, 420)
        self.assertEqual(avisos[0].nivel, "informativo")


class PruebaValidaciones(unittest.TestCase):

    def test_eficiencia_fuera_de_rango(self):
        with self.assertRaises(ErrorDominio):
            carga.Supuestos(eficiencia_cosecha=1.5)

    def test_superficie_cero(self):
        with self.assertRaises(ErrorDominio):
            carga.forraje_utilizable(2000, 0)

    def test_cabezas_negativas(self):
        with self.assertRaises(ErrorDominio):
            carga.consumo_diario(-5, 420)


class PruebaRotacion(unittest.TestCase):

    def test_entra_primero_al_de_mas_forraje(self):
        orden = carga.orden_de_rotacion({"A": 1800, "B": 3200, "C": 2400})
        self.assertEqual([n for n, _ in orden], ["B", "C", "A"])

    def test_sin_potreros_falla(self):
        with self.assertRaises(ErrorDominio):
            carga.orden_de_rotacion({})


if __name__ == "__main__":
    unittest.main()
