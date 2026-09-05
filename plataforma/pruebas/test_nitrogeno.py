# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · NITRÓGENO POR ÍNDICE DE SUFICIENCIA
#
# El criterio de aceptación: SIN franja de referencia el motor se niega a
# dar dosis. Y en el otro extremo, con una caída demasiado grande, tampoco
# recomienda urea: manda a mirar el lote.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor.dominio import nitrogeno
from motor.dominio.errores import DatoInsuficiente, ErrorDominio


class PruebaSinFranjaDeReferencia(unittest.TestCase):

    def test_recomendar_sin_referencia_lanza_dato_insuficiente(self):
        with self.assertRaises(DatoInsuficiente) as ctx:
            nitrogeno.recomendar({1: 0.40, 2: 0.35}, ndre_referencia=None)
        mensaje = str(ctx.exception)
        self.assertIn("franja de referencia", mensaje)
        self.assertIn("mapa de variabilidad", mensaje)

    def test_el_mapa_de_variabilidad_se_llama_por_su_nombre(self):
        variabilidad, avisos = nitrogeno.mapa_variabilidad({1: 0.40, 2: 0.30, 3: 0.20})

        self.assertEqual(variabilidad[1]["relativo_al_maximo"], 1.0)
        self.assertEqual(variabilidad[3]["relativo_al_maximo"], 0.5)

        # Y viene con la advertencia de que NO es una prescripción.
        self.assertEqual(len(avisos), 1)
        self.assertEqual(avisos[0].nivel, "advertencia")
        self.assertIn("NO prescripción", avisos[0].texto)

    def test_indice_de_suficiencia_sin_referencia_falla(self):
        with self.assertRaises(DatoInsuficiente):
            nitrogeno.indice_suficiencia(0.4, None)


class PruebaDosis(unittest.TestCase):

    def test_zona_suficiente_no_lleva_nada(self):
        d, motivo = nitrogeno.dosis(0.98)
        self.assertEqual(d, 0.0)
        self.assertIn("suficiente", motivo)

    def test_dosis_maxima_en_el_umbral(self):
        p = nitrogeno.Parametros()
        d, _ = nitrogeno.dosis(p.si_dosis_maxima)
        self.assertEqual(d, p.dosis_maxima_kg_ha)

    def test_es_monotona_en_el_rango_con_respuesta(self):
        # A menor suficiencia, más dosis. Si esto se rompe, el mapa de
        # prescripción sale al revés y nadie lo nota hasta la cosecha.
        p = nitrogeno.Parametros()
        anterior = -1.0
        si = p.umbral_suficiencia
        while si >= p.si_dosis_maxima:
            d, _ = nitrogeno.dosis(si)
            self.assertGreaterEqual(d, anterior)
            anterior = d
            si -= 0.01

    def test_caida_demasiado_grande_manda_a_campo(self):
        # Esta es la regla que separa un modelo de un agrónomo: por debajo
        # del umbral de respuesta, echarle urea es tirar plata.
        p = nitrogeno.Parametros()
        d, motivo = nitrogeno.dosis(p.si_sin_respuesta - 0.05)
        self.assertEqual(d, 0.0)
        self.assertIn("Revisar a campo", motivo)

    def test_dosis_por_debajo_del_minimo_aplicable_es_cero(self):
        # No se manda una máquina al lote por 4 kg de urea.
        p = nitrogeno.Parametros(dosis_minima_aplicable_kg_ha=30.0)
        d, motivo = nitrogeno.dosis(0.94, p)
        self.assertEqual(d, 0.0)
        self.assertIn("mínimo aplicable", motivo)

    def test_parametros_incoherentes_se_rechazan(self):
        with self.assertRaises(ErrorDominio):
            nitrogeno.Parametros(umbral_suficiencia=0.60, si_dosis_maxima=0.70)


class PruebaPrescripcionCompleta(unittest.TestCase):

    def test_prescripcion_por_zonas(self):
        zonas = {1: 0.48, 2: 0.44, 3: 0.38, 4: 0.24}
        prescripcion, recomendaciones = nitrogeno.recomendar(zonas, ndre_referencia=0.50)

        self.assertEqual(set(prescripcion), {1, 2, 3, 4})

        # Zona 1: SI = 0,96 -> suficiente.
        self.assertEqual(prescripcion[1]["dosis_kg_ha"], 0.0)
        # Zona 3: SI = 0,76 -> lleva dosis.
        self.assertGreater(prescripcion[3]["dosis_kg_ha"], 0.0)
        # Zona 4: SI = 0,48 -> demasiado baja, no se fertiliza, se revisa.
        self.assertEqual(prescripcion[4]["dosis_kg_ha"], 0.0)

        niveles = [r.nivel for r in recomendaciones]
        self.assertIn("revisar_a_campo", niveles)

        # Cada dosis lleva su justificación escrita.
        for datos in prescripcion.values():
            self.assertTrue(datos["justificacion"].strip())

    def test_toda_recomendacion_lleva_fuente_y_supuestos(self):
        _, recomendaciones = nitrogeno.recomendar({1: 0.40}, ndre_referencia=0.50)
        for r in recomendaciones:
            self.assertTrue(r.fuente.strip())
            self.assertIn("umbral_suficiencia", r.supuestos)

    def test_referencia_invalida_se_rechaza(self):
        with self.assertRaises(ErrorDominio):
            nitrogeno.recomendar({1: 0.40}, ndre_referencia=0.0)


if __name__ == "__main__":
    unittest.main()
