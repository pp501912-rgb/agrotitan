# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · FORRAJE DISPONIBLE Y CARGA ANIMAL
#
# El número que el ganadero usa el lunes a la mañana: cuántos días le dura
# este potrero con estos animales.
#
# Todo lo que hay acá son cuentas simples. Lo que importa es que cada
# supuesto —cuánto del pasto se cosecha de verdad, cuánto remanente hay que
# dejar, cuánto come un animal— esté declarado y sea configurable, porque
# ahí es donde un forrajero y otro discuten, y con razón.
# ═══════════════════════════════════════════════════════════════════════

from motor.dominio.errores import ErrorDominio
from motor.dominio.recomendacion import Recomendacion

FUENTE = ("Presupuestación forrajera estándar: forraje utilizable = "
          "(disponible - remanente) x eficiencia de cosecha; consumo diario como "
          "porcentaje del peso vivo. Los coeficientes se ajustan por sistema y recurso.")


class Supuestos:
    """
    Los coeficientes de la cuenta, todos discutibles y todos explícitos.
    """

    def __init__(self, eficiencia_cosecha=0.60, remanente_kg_ms_ha=1200.0,
                 consumo_pct_peso_vivo=2.8):

        # Cuánto del forraje disponible termina realmente en el animal.
        # El resto se pisa, se ensucia o queda fuera de alcance. 0,60 es un
        # valor de pastoreo rotativo bien manejado; en pastoreo continuo baja.
        self.eficiencia_cosecha = eficiencia_cosecha

        # Lo que NO se puede comer sin comprometer el rebrote. Depende de la
        # especie: una pastura de festuca no es un campo natural.
        self.remanente_kg_ms_ha = remanente_kg_ms_ha

        # Consumo diario de materia seca como porcentaje del peso vivo.
        # 2,8 % es un valor de trabajo para bovinos en pastoreo; una vaca en
        # lactancia come más, un novillo en engorde menos en proporción.
        self.consumo_pct_peso_vivo = consumo_pct_peso_vivo

        if not 0 < eficiencia_cosecha <= 1:
            raise ErrorDominio("La eficiencia de cosecha tiene que estar entre 0 y 1")
        if remanente_kg_ms_ha < 0:
            raise ErrorDominio("El remanente no puede ser negativo")
        if not 0 < consumo_pct_peso_vivo < 10:
            raise ErrorDominio("El consumo como % del peso vivo está fuera de rango")

    def como_dict(self):
        return {
            "eficiencia_cosecha": self.eficiencia_cosecha,
            "remanente_kg_ms_ha": self.remanente_kg_ms_ha,
            "consumo_pct_peso_vivo": self.consumo_pct_peso_vivo,
        }


def forraje_utilizable(kg_ms_ha, superficie_ha, supuestos=None):
    """kg de materia seca realmente aprovechables en el potrero."""
    s = supuestos or Supuestos()

    if kg_ms_ha < 0 or superficie_ha <= 0:
        raise ErrorDominio("Disponibilidad y superficie tienen que ser positivas")

    sobre_remanente = max(0.0, kg_ms_ha - s.remanente_kg_ms_ha)
    return sobre_remanente * s.eficiencia_cosecha * superficie_ha


def consumo_diario(cabezas, peso_promedio_kg, supuestos=None):
    """kg de materia seca que come el lote por día."""
    s = supuestos or Supuestos()

    if cabezas <= 0 or peso_promedio_kg <= 0:
        raise ErrorDominio("Cabezas y peso promedio tienen que ser positivos")

    return cabezas * peso_promedio_kg * (s.consumo_pct_peso_vivo / 100.0)


def dias_de_pastoreo(kg_ms_ha, superficie_ha, cabezas, peso_promedio_kg,
                     supuestos=None):
    """
    Cuántos días aguanta el potrero. Devuelve (dias, detalle, recomendaciones).
    """
    s = supuestos or Supuestos()

    utilizable = forraje_utilizable(kg_ms_ha, superficie_ha, s)
    consumo = consumo_diario(cabezas, peso_promedio_kg, s)
    dias = utilizable / consumo if consumo > 0 else 0.0

    detalle = {
        "kg_ms_ha_disponible": kg_ms_ha,
        "superficie_ha": superficie_ha,
        "kg_ms_utilizable_total": round(utilizable, 1),
        "consumo_diario_kg_ms": round(consumo, 1),
        "dias": round(dias, 1),
        "carga_instantanea_cab_ha": round(cabezas / superficie_ha, 2),
        "supuestos": s.como_dict(),
    }

    recomendaciones = []

    if kg_ms_ha <= s.remanente_kg_ms_ha:
        recomendaciones.append(Recomendacion(
            texto=(f"El potrero tiene {kg_ms_ha:.0f} kg MS/ha, igual o menos que el "
                   f"remanente objetivo de {s.remanente_kg_ms_ha:.0f}. No hay forraje "
                   f"utilizable: entrar acá compromete el rebrote."),
            fuente=FUENTE,
            nivel="advertencia",
            umbral_aplicado=f"disponible ≤ remanente ({s.remanente_kg_ms_ha:.0f} kg MS/ha)",
            supuestos=s.como_dict(),
            medicion=detalle,
        ))
    elif dias < 1:
        recomendaciones.append(Recomendacion(
            texto=(f"Con {cabezas} cabezas de {peso_promedio_kg:.0f} kg, este potrero no "
                   f"alcanza para un día completo ({dias:.1f} días). Revisar la carga o "
                   f"la superficie asignada."),
            fuente=FUENTE,
            nivel="advertencia",
            umbral_aplicado="menos de 1 día de pastoreo",
            supuestos=s.como_dict(),
            medicion=detalle,
        ))
    else:
        recomendaciones.append(Recomendacion(
            texto=(f"Forraje utilizable: {utilizable:.0f} kg MS. Con {cabezas} cabezas de "
                   f"{peso_promedio_kg:.0f} kg comiendo {consumo:.0f} kg MS/día, alcanza "
                   f"para {dias:.1f} días dejando {s.remanente_kg_ms_ha:.0f} kg MS/ha de "
                   f"remanente."),
            fuente=FUENTE,
            nivel="informativo",
            umbral_aplicado=f"eficiencia de cosecha {s.eficiencia_cosecha:.0%}",
            supuestos=s.como_dict(),
            medicion=detalle,
        ))

    return round(dias, 1), detalle, recomendaciones


def orden_de_rotacion(potreros):
    """
    En qué orden conviene entrar a los potreros.

    `potreros` es {nombre: kg_ms_ha}. Se entra primero al de más forraje: es
    el que antes se pasa de punto y pierde calidad. Es la regla más simple y
    la más usada; no contempla descanso previo ni calidad, que dependen de
    datos que el vuelo no ve.
    """
    if not potreros:
        raise ErrorDominio("No hay potreros para ordenar")

    return sorted(potreros.items(), key=lambda kv: kv[1], reverse=True)
