# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · NITRÓGENO VARIABLE POR ÍNDICE DE SUFICIENCIA
#
# El método consolidado para decidir refertilización con sensores de
# canopeo. La idea, en una línea: comparar cada zona del lote contra una
# franja del MISMO lote donde el nitrógeno seguro no falta.
#
#     SI = NDRE_zona / NDRE_franja_referencia
#
# SIN FRANJA DE REFERENCIA NO HAY DOSIS. No es una limitación del programa:
# sin denominador el índice de suficiencia no existe. Lo que sí se puede
# entregar es un MAPA DE VARIABILIDAD, que muestra dónde el lote es
# distinto pero no dice cuánto fertilizar ni por qué. Son dos productos
# diferentes y el motor no los confunde.
#
# Se usa NDRE y no NDVI porque el NDVI satura en canopeo denso, justo en el
# momento en que hay que decidir la refertilización.
#
# Fuentes: Holland y Schepers (2010), Agronomy Journal, para el algoritmo
# basado en sensor; Barnes et al. (2000) para el NDRE.
# ═══════════════════════════════════════════════════════════════════════

from motor.dominio.errores import DatoInsuficiente, ErrorDominio
from motor.dominio.recomendacion import Recomendacion

FUENTE = ("Holland y Schepers (2010), Agronomy Journal 102:1415-1424; "
          "Barnes et al. (2000), Proc. 5th Int. Conf. Precision Agriculture")


class Parametros:
    """
    Los umbrales del modelo, explícitos y configurables.

    Ninguno de estos números es una ley de la naturaleza: son valores de
    trabajo que hay que ajustar por cultivo y por zona. Están acá, con su
    justificación al lado, y no incrustados en medio de una fórmula.
    """

    def __init__(self, dosis_maxima_kg_ha=120.0, umbral_suficiencia=0.95,
                 si_dosis_maxima=0.70, si_sin_respuesta=0.55,
                 dosis_minima_aplicable_kg_ha=15.0):

        # Techo agronómico y económico de la refertilización. Es el primer
        # número que hay que cambiar según cultivo, rinde objetivo y precio.
        self.dosis_maxima_kg_ha = dosis_maxima_kg_ha

        # Por encima de esto la zona se considera suficiente. No es 1,00
        # porque la variabilidad natural del canopeo y del sensor hace que
        # una zona sana rara vez iguale exactamente a la franja rica.
        self.umbral_suficiencia = umbral_suficiencia

        # SI en el que se aplica la dosis máxima. Entre este valor y el
        # umbral, la dosis crece de forma lineal.
        self.si_dosis_maxima = si_dosis_maxima

        # Por DEBAJO de esto la diferencia es demasiado grande para ser solo
        # nitrógeno. Suele haber otra limitación —agua, compactación, pH,
        # una falla de siembra— y echarle urea es tirar plata. El motor no
        # recomienda: manda a mirar el lote. Esta es la regla que separa un
        # modelo de un agrónomo.
        self.si_sin_respuesta = si_sin_respuesta

        # Por debajo de esta dosis no vale la pena una pasada de máquina.
        self.dosis_minima_aplicable_kg_ha = dosis_minima_aplicable_kg_ha

        if not (si_sin_respuesta < si_dosis_maxima < umbral_suficiencia):
            raise ErrorDominio(
                "Los umbrales tienen que cumplir: "
                "si_sin_respuesta < si_dosis_maxima < umbral_suficiencia")

    def como_dict(self):
        return {
            "dosis_maxima_kg_ha": self.dosis_maxima_kg_ha,
            "umbral_suficiencia": self.umbral_suficiencia,
            "si_dosis_maxima": self.si_dosis_maxima,
            "si_sin_respuesta": self.si_sin_respuesta,
            "dosis_minima_aplicable_kg_ha": self.dosis_minima_aplicable_kg_ha,
        }


def indice_suficiencia(ndre_zona, ndre_referencia):
    """SI de una zona contra la franja de referencia."""
    if ndre_referencia is None:
        raise DatoInsuficiente(
            "No hay NDRE de franja de referencia: el índice de suficiencia no existe")

    if ndre_referencia <= 0:
        raise ErrorDominio(
            f"El NDRE de la franja de referencia es {ndre_referencia}, "
            f"que no puede ser: revisá la geometría de la franja o el vuelo")

    return ndre_zona / ndre_referencia


def dosis(si, parametros=None):
    """
    Dosis de nitrógeno para un índice de suficiencia dado, en kg N/ha.

    Devuelve (dosis_kg_ha, motivo). El motivo se guarda como justificación
    en manejo.dosis: cada número tiene que poder explicarse solo.
    """
    p = parametros or Parametros()

    if si >= p.umbral_suficiencia:
        return 0.0, (f"SI = {si:.2f} ≥ {p.umbral_suficiencia}: la zona está "
                     f"suficiente en nitrógeno")

    if si < p.si_sin_respuesta:
        # Deliberadamente NO se recomienda la dosis máxima acá.
        return 0.0, (f"SI = {si:.2f} < {p.si_sin_respuesta}: la caída es demasiado "
                     f"grande para atribuirla solo a nitrógeno. Revisar a campo antes "
                     f"de fertilizar")

    # Interpolación lineal entre el umbral de suficiencia y el de dosis máxima.
    if si <= p.si_dosis_maxima:
        d = p.dosis_maxima_kg_ha
    else:
        proporcion = (p.umbral_suficiencia - si) / (p.umbral_suficiencia - p.si_dosis_maxima)
        d = p.dosis_maxima_kg_ha * proporcion

    if d < p.dosis_minima_aplicable_kg_ha:
        return 0.0, (f"SI = {si:.2f}: la dosis calculada ({d:.0f} kg N/ha) no llega al "
                     f"mínimo aplicable de {p.dosis_minima_aplicable_kg_ha:.0f} kg N/ha")

    return round(d, 1), f"SI = {si:.2f}: deficiencia proporcional al índice de suficiencia"


def recomendar(zonas_ndre, ndre_referencia, parametros=None):
    """
    Prescripción completa a partir del NDRE medio de cada zona.

    `zonas_ndre` es {numero_de_zona: ndre_medio}.
    Devuelve (prescripcion, recomendaciones).

    Si no hay franja de referencia, LANZA DatoInsuficiente. Quien llama debe
    usar `mapa_variabilidad()` y decirle al usuario que eso es lo que es.
    """
    if ndre_referencia is None:
        raise DatoInsuficiente(
            "No se puede recomendar dosis de nitrógeno sin franja de referencia. "
            "El índice de suficiencia necesita un NDRE de referencia medido en el "
            "mismo lote y en el mismo vuelo. Lo que se puede entregar es un mapa de "
            "variabilidad: usar mapa_variabilidad().")

    if not zonas_ndre:
        raise DatoInsuficiente("No hay zonas para prescribir")

    p = parametros or Parametros()
    prescripcion, recomendaciones = {}, []

    for numero, ndre in sorted(zonas_ndre.items()):
        si = indice_suficiencia(ndre, ndre_referencia)
        d, motivo = dosis(si, p)
        prescripcion[numero] = {
            "indice_suficiencia": round(si, 4),
            "dosis_kg_ha": d,
            "justificacion": motivo,
        }

        if si < p.si_sin_respuesta:
            recomendaciones.append(Recomendacion(
                texto=(f"Zona {numero}: el índice de suficiencia es {si:.2f}, muy por "
                       f"debajo de la franja de referencia. Antes de fertilizar, revisar "
                       f"a campo: una caída así suele venir de agua, compactación, pH o "
                       f"una falla de siembra, y en ese caso el nitrógeno no responde."),
                fuente=FUENTE,
                nivel="revisar_a_campo",
                umbral_aplicado=f"SI < {p.si_sin_respuesta}",
                supuestos=p.como_dict(),
                medicion={"ndre_zona": ndre, "ndre_referencia": ndre_referencia,
                          "indice_suficiencia": round(si, 4)},
            ))

    total_zonas = len(prescripcion)
    zonas_con_dosis = sum(1 for v in prescripcion.values() if v["dosis_kg_ha"] > 0)

    recomendaciones.append(Recomendacion(
        texto=(f"Prescripción de nitrógeno sobre {total_zonas} zonas: "
               f"{zonas_con_dosis} llevan dosis. Calculada por índice de suficiencia "
               f"sobre NDRE contra franja de referencia (NDRE = {ndre_referencia:.3f})."),
        fuente=FUENTE,
        nivel="sugerencia",
        umbral_aplicado=f"suficiencia ≥ {p.umbral_suficiencia}",
        supuestos=p.como_dict(),
        medicion={"ndre_referencia": ndre_referencia, "zonas": total_zonas},
    ))

    return prescripcion, recomendaciones


def mapa_variabilidad(zonas_ndre):
    """
    Lo que se puede entregar cuando NO hay franja de referencia.

    Normaliza contra la zona de mayor NDRE del propio lote. Es útil —muestra
    dónde el lote es distinto— pero NO es una recomendación de dosis: la
    mejor zona del lote puede estar deficiente también, y entonces todo el
    mapa está corrido. Esa advertencia va incluida en la salida.
    """
    if not zonas_ndre:
        raise DatoInsuficiente("No hay zonas para mapear")

    maximo = max(zonas_ndre.values())
    if maximo <= 0:
        raise ErrorDominio(f"El NDRE máximo del lote es {maximo}: revisá el vuelo")

    variabilidad = {
        numero: {"ndre": ndre, "relativo_al_maximo": round(ndre / maximo, 4)}
        for numero, ndre in sorted(zonas_ndre.items())
    }

    advertencia = Recomendacion(
        texto=("Mapa de variabilidad, NO prescripción de nitrógeno. No hay franja de "
               "referencia en este lote, así que cada zona se compara contra la mejor "
               "zona del propio lote. Si esa mejor zona también está deficiente, todo "
               "el mapa queda corrido y las dosis que salgan de acá estarían mal. Para "
               "prescribir, instalar una franja sobrefertilizada al menos dos semanas "
               "antes del próximo vuelo."),
        fuente=FUENTE,
        nivel="advertencia",
        umbral_aplicado="sin umbral: no hay referencia externa",
        supuestos={"normalizacion": "contra el NDRE máximo del propio lote"},
        medicion={"ndre_maximo": maximo, "zonas": len(zonas_ndre)},
    )

    return variabilidad, [advertencia]
