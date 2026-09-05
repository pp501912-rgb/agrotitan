# ═══════════════════════════════════════════════════════════════════════
# PRUEBA · PLAN DE ESCRITURA
#
# El plan es la parte de la persistencia que decide, y por eso es la que se
# prueba. Los dos errores que puede tener son feos y silenciosos: escribir
# en el orden equivocado —usar el id de algo que todavía no existe— y dejar
# entrar una recomendación sin fuente.
# ═══════════════════════════════════════════════════════════════════════

import unittest

from motor.dominio.errores import ErrorDominio
from motor.dominio.recomendacion import Recomendacion
from motor.persistencia import (Operacion, Referencia, plan_de_error,
                                plan_de_escritura, resolver, resumen)

ORG = "11111111-1111-1111-1111-111111111111"
VUELO = "44444444-4444-4444-4444-444444444444"

_CUADRADO = {"type": "Polygon",
             "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]}


def _contexto(**cambios):
    c = {
        "organizacion": "prueba", "campo": "La Esperanza", "lote": "Lote 1",
        "fecha": "2026-03-15",
        "comparable": True,
        "sha256_entrada": "a" * 64,
        "superficie_ha": 128.5,
        "geo": {"crs": "EPSG:32721", "epsg_utm": 32721,
                "footprint": _CUADRADO, "superficie_ha": 128.5},
        "ortomosaico": {
            "ruta_cog": "/datos/o.tif", "footprint": _CUADRADO, "n_bandas": 5,
            "dtype": "uint16", "escala": 10000, "crs": "EPSG:32721",
            "ancho_px": 900, "alto_px": 700, "sha256": "a" * 64},
        "indices": {
            "NDVI": {"ruta_cog": "/datos/ndvi.tif", "escala": 10000,
                     "media": 0.71, "desvio": 0.08, "minimo": 0.05,
                     "maximo": 0.93, "p5": 0.55, "p95": 0.88},
        },
        "indices_no_disponibles": {"EVI": "falta la banda «blue»"},
        "zonas": [{"zona": 1, "geometry": _CUADRADO, "superficie_ha": 40.2},
                  {"zona": 2, "geometry": _CUADRADO, "superficie_ha": 88.3}],
        "detalle_zonas": {"k": 2, "resolucion_m": 3.0},
        "prescripcion": {
            1: {"dosis_kg_ha": 0.0, "justificacion": "suficiente"},
            2: {"dosis_kg_ha": 60.0, "justificacion": "deficit"}},
        "recomendaciones": [
            Recomendacion("Aplicar 60 kg N/ha en la zona 2",
                          "Holland y Schepers (2010)")],
        "duracion_seg": 12.5,
        "pico_memoria_mb": 380.0,
    }
    c.update(cambios)
    return c


class PruebaResolucionDeReferencias(unittest.TestCase):
    """La parte donde se esconde el error de usar un id antes de que exista."""

    def test_valores_sueltos_pasan_derecho(self):
        self.assertEqual(resolver((1, "a", None), {}), (1, "a", None))

    def test_referencia_simple(self):
        self.assertEqual(resolver((Referencia("x"),), {"x": 7}), (7,))

    def test_referencia_con_indice(self):
        r = resolver((Referencia("corrida", 0), Referencia("corrida", 1)),
                     {"corrida": ("id-7", "2026-03-15")})
        self.assertEqual(r, ("id-7", "2026-03-15"))

    def test_referencia_a_algo_que_no_se_ejecuto_falla_claro(self):
        with self.assertRaises(ErrorDominio) as ctx:
            resolver((Referencia("ortomosaico_id"),), {})
        self.assertIn("orden del plan", str(ctx.exception))


class PruebaOrden(unittest.TestCase):
    """
    Cada Referencia tiene que resolverse con lo que ya se guardó antes.
    Se simula la ejecución sin base: se recorre el plan, se resuelve cada
    operación y se anota lo que habría devuelto.
    """

    def test_el_plan_se_puede_ejecutar_en_orden(self):
        plan = plan_de_escritura(_contexto(), ids={"vuelo_id": VUELO})
        resultados = {}

        for operacion in plan:
            # Si el orden estuviera mal, esto lanza ErrorDominio.
            resolver(operacion.parametros, resultados)
            if operacion.devuelve_fila and operacion.guarda_como:
                resultados[operacion.guarda_como] = ("id-simulado", "2026-03-15")

    def test_la_auditoria_abre_primero_y_cierra_ultimo(self):
        plan = plan_de_escritura(_contexto(), ids={"vuelo_id": VUELO})
        nombres = [o.nombre for o in plan]
        self.assertIn("abrir_corrida", nombres)
        self.assertEqual(nombres[-1], "cerrar_corrida")
        self.assertLess(nombres.index("abrir_corrida"),
                        nombres.index("insertar_vuelo"))

    def test_el_ortomosaico_va_antes_que_sus_capas(self):
        plan = plan_de_escritura(_contexto(), ids={"vuelo_id": VUELO})
        nombres = [o.nombre for o in plan]
        self.assertLess(nombres.index("insertar_ortomosaico"),
                        nombres.index("insertar_capa"))

    def test_las_zonas_van_antes_que_las_dosis(self):
        plan = plan_de_escritura(_contexto(), ids={"vuelo_id": VUELO})
        nombres = [o.nombre for o in plan]
        self.assertLess(nombres.index("insertar_zona"),
                        nombres.index("insertar_dosis"))


class PruebaContenido(unittest.TestCase):

    def test_escribe_todo_lo_que_corresponde(self):
        plan = plan_de_escritura(_contexto(), ids={"vuelo_id": VUELO})
        cuenta = resumen(plan)

        self.assertEqual(cuenta["insertar_vuelo"], 1)
        self.assertEqual(cuenta["insertar_capa"], 1)
        self.assertEqual(cuenta["insertar_zona"], 2)
        self.assertEqual(cuenta["insertar_dosis"], 2)
        self.assertEqual(cuenta["insertar_recomendacion"], 1)

    def test_los_indices_no_disponibles_quedan_registrados(self):
        # No en un log: en control_calidad. Dentro de dos campañas alguien va
        # a preguntar por qué este vuelo no tiene EVI.
        plan = plan_de_escritura(_contexto(), ids={"vuelo_id": VUELO})
        controles = [o for o in plan if o.nombre == "insertar_control_calidad"]
        self.assertEqual(len(controles), 1)
        self.assertIn("blue", controles[0].parametros[5])

    def test_un_vuelo_sin_calibracion_deja_constancia(self):
        plan = plan_de_escritura(_contexto(comparable=False),
                                 ids={"vuelo_id": VUELO})
        motivos = [o.parametros[5] for o in plan
                   if o.nombre == "insertar_control_calidad"]
        self.assertTrue(any("números digitales" in m for m in motivos))

    def test_comparable_sin_calibracion_no_se_marca_comparable(self):
        # La base tiene chk_comparable; el plan no le manda algo que sabe que
        # va a rebotar. Son dos redes para la misma regla.
        plan = plan_de_escritura(_contexto(comparable=True),
                                 ids={"vuelo_id": VUELO})
        vuelo = next(o for o in plan if o.nombre == "insertar_vuelo")
        self.assertFalse(vuelo.parametros[14])

    def test_con_calibracion_si_se_marca_comparable(self):
        plan = plan_de_escritura(
            _contexto(comparable=True),
            ids={"vuelo_id": VUELO, "calibracion_id": "cal-1"})
        vuelo = next(o for o in plan if o.nombre == "insertar_vuelo")
        self.assertTrue(vuelo.parametros[14])

    def test_los_percentiles_llegan_a_la_capa(self):
        plan = plan_de_escritura(_contexto(), ids={"vuelo_id": VUELO})
        capa = next(o for o in plan if o.nombre == "insertar_capa")
        self.assertEqual(capa.parametros[10], 0.55)     # p5
        self.assertEqual(capa.parametros[11], 0.88)     # p95


class PruebaReglas(unittest.TestCase):

    def test_sin_vuelo_id_no_hay_plan(self):
        with self.assertRaises(ErrorDominio) as ctx:
            plan_de_escritura(_contexto(), ids={})
        self.assertIn("vuelo_id", str(ctx.exception))

    def test_sin_huella_no_se_puede_crear_el_lote(self):
        with self.assertRaises(ErrorDominio) as ctx:
            plan_de_escritura(_contexto(geo={}), ids={"vuelo_id": VUELO})
        self.assertIn("huella", str(ctx.exception))

    def test_con_lote_conocido_no_hace_falta_la_huella(self):
        plan = plan_de_escritura(
            _contexto(geo={}),
            ids={"vuelo_id": VUELO, "organizacion_id": ORG, "lote_id": "lote-1"})
        self.assertNotIn("upsert_lote", resumen(plan))

    def test_una_recomendacion_sin_fuente_no_entra_al_plan(self):
        class Falsa:
            texto = "Fertilizar todo"
            fuente = ""
            umbral_aplicado = None
            supuestos = {}
            version_motor = "0.1.0"

        with self.assertRaises(ErrorDominio) as ctx:
            plan_de_escritura(_contexto(recomendaciones=[Falsa()]),
                              ids={"vuelo_id": VUELO})
        self.assertIn("sin fuente", str(ctx.exception))

    def test_una_sentencia_inexistente_se_rechaza_al_construir(self):
        with self.assertRaises(ErrorDominio):
            Operacion("sentencia_que_no_existe", ())


class PruebaColumnasJsonb(unittest.TestCase):
    """
    Prueba de regresión de un bug real que encontró el arnés contra
    PostgreSQL: las columnas jsonb del esquema son NOT NULL con DEFAULT
    '{}', y el DEFAULT no se aplica cuando se pasa NULL explícito. Pasar
    None hacía rebotar el INSERT de TODA corrida.
    """

    def test_parametros_de_la_corrida_nunca_van_en_null(self):
        # El contexto no trae "parametros": antes esto mandaba NULL.
        plan = plan_de_escritura(_contexto(), ids={"vuelo_id": VUELO})
        corrida = next(o for o in plan if o.nombre == "abrir_corrida")
        self.assertEqual(corrida.parametros[5], "{}")

    def test_los_supuestos_de_la_zona_nunca_van_en_null(self):
        plan = plan_de_escritura(_contexto(detalle_zonas=None),
                                 ids={"vuelo_id": VUELO})
        zona = next(o for o in plan if o.nombre == "insertar_zona")
        self.assertIsNotNone(zona.parametros[8])

    def test_los_supuestos_de_la_recomendacion_nunca_van_en_null(self):
        plan = plan_de_escritura(_contexto(), ids={"vuelo_id": VUELO})
        rec = next(o for o in plan if o.nombre == "insertar_recomendacion")
        self.assertIsNotNone(rec.parametros[5])

    def test_el_plan_de_error_tampoco(self):
        plan = plan_de_error({"fecha": "2026-03-15"},
                             ids={"organizacion_id": ORG, "vuelo_id": VUELO})
        self.assertEqual(plan[0].parametros[5], "{}")


class PruebaPlanDeError(unittest.TestCase):

    def test_una_corrida_que_falla_deja_rastro(self):
        plan = plan_de_error(
            {"fecha": "2026-03-15", "duracion_seg": 3.2,
             "pico_memoria_mb": 120.0, "mensaje": "se rompió"},
            ids={"organizacion_id": ORG, "vuelo_id": VUELO})

        self.assertEqual([o.nombre for o in plan],
                         ["abrir_corrida", "cerrar_corrida"])
        self.assertEqual(plan[1].parametros[0], "error")
        self.assertEqual(plan[1].parametros[3], "se rompió")


if __name__ == "__main__":
    unittest.main()
