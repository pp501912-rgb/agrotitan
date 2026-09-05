# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · INFORME HTML
#
# Lo que más importa verificar acá no es que se vea lindo: es que muestre lo
# que NO se pudo calcular, y que un texto con comillas o con < no rompa la
# página ni inyecte nada.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor import informe
from motor.dominio.recomendacion import Recomendacion


def _contexto(**cambios):
    c = {
        "lote": "Lote 1",
        "campo": "La Esperanza",
        "fecha": "2026-03-15",
        "perfil_camara": "mavic3m",
        "superficie_ha": 128.5,
        "comparable": True,
        "indices": {
            "NDVI": {"media": 0.712, "desvio": 0.081, "minimo": 0.05,
                     "maximo": 0.93, "fuente": "Rouse et al. (1974)"},
        },
        "indices_no_disponibles": {
            "EVI": "falta la banda «blue» en DJI Mavic 3 Multispectral",
        },
        "zonas": [{"zona": 1, "superficie_ha": 40.2},
                  {"zona": 2, "superficie_ha": 88.3}],
        "detalle_zonas": {"k": 2, "resolucion_m": 3.0, "superficie_minima_ha": 0.5},
        "recomendaciones": [
            Recomendacion("Aplicar 60 kg N/ha en la zona 2",
                          "Holland y Schepers (2010)", nivel="sugerencia"),
        ],
    }
    c.update(cambios)
    return c


class PruebaEstructura(unittest.TestCase):

    def test_genera_html_completo(self):
        h = informe.generar(_contexto())
        self.assertTrue(h.startswith("<!doctype html>"))
        self.assertTrue(h.rstrip().endswith("</html>"))

    def test_es_autocontenido(self):
        # Sin CSS externo, sin fuentes remotas, sin JavaScript: tiene que
        # verse igual dentro de cinco años, abierto desde un pendrive.
        h = informe.generar(_contexto())
        self.assertNotIn("<script", h)
        self.assertNotIn("http://", h)
        self.assertNotIn("https://", h)
        self.assertNotIn("<link", h)

    def test_muestra_lo_que_no_se_pudo_calcular(self):
        h = informe.generar(_contexto())
        self.assertIn("no permite calcular", h)
        self.assertIn("EVI", h)
        self.assertIn("blue", h)

    def test_un_vuelo_sin_calibracion_lo_dice_arriba(self):
        h = informe.generar(_contexto(comparable=False))
        self.assertIn("no se pueden comparar con los de otra fecha", h)

    def test_informe_minimo_no_rompe(self):
        # Un vuelo del que solo se calcularon índices igual tiene que producir
        # un informe válido.
        h = informe.generar({"lote": "L", "fecha": "2026-01-01"})
        self.assertIn("</html>", h)

    def test_calibracion_pobre_se_advierte(self):
        h = informe.generar(_contexto(calibracion_biomasa={
            "indice": "NDVI", "r2": 0.41, "rmse_kg_ms_ha": 620,
            "n_muestras": 25, "origen": "corte", "ajuste_pobre": True}))
        self.assertIn("no deberían usarse para decidir carga", h.replace("\n", " "))


class PruebaEscapado(unittest.TestCase):

    def test_escapa_el_texto_de_las_recomendaciones(self):
        r = Recomendacion("Revisar <script>alert(1)</script> el lote",
                          "Fuente (2020)")
        h = informe.generar(_contexto(recomendaciones=[r]))
        self.assertNotIn("<script>alert", h)
        self.assertIn("&lt;script&gt;", h)

    def test_escapa_los_nombres_de_lote(self):
        h = informe.generar(_contexto(lote='Lote "3" & 4'))
        self.assertIn("&amp;", h)
        self.assertNotIn('Lote "3" & 4', h)


class PruebaFormatoDeNumeros(unittest.TestCase):

    def test_usa_coma_decimal(self):
        # Es un informe en español para el Cono Sur.
        h = informe.generar(_contexto())
        self.assertIn("0,712", h)

    def test_valor_ausente_no_muestra_none(self):
        h = informe.generar(_contexto(indices={"NDVI": {"media": None}}))
        self.assertNotIn("None", h)


if __name__ == "__main__":
    unittest.main()
