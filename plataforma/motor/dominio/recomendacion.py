# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · RECOMENDACIONES
#
# Una recomendación no es un texto: es un texto MÁS lo que hace falta para
# discutirlo. Qué se midió, qué umbral se aplicó, qué se supuso y de dónde
# sale el criterio.
#
# Por eso `fuente` es obligatoria en el constructor y no un parámetro con
# valor por omisión. La base de datos también lo impide (NOT NULL), pero
# fallar acá es mejor: el error aparece donde se escribió la regla, no tres
# capas después cuando ya nadie se acuerda.
#
# Un modelo sin supuestos declarados es una opinión con decimales.
# ═══════════════════════════════════════════════════════════════════════

from motor.dominio.errores import ErrorDominio
from motor.version import VERSION

# Qué tan fuerte es el consejo. No es decorativo: el informe ordena por esto,
# y "revisar" nunca debería leerse como "aplicar".
NIVELES = ("informativo", "sugerencia", "advertencia", "revisar_a_campo")


class Recomendacion:
    __slots__ = ("texto", "fuente", "nivel", "umbral_aplicado",
                 "supuestos", "medicion", "version_motor")

    def __init__(self, texto, fuente, nivel="sugerencia", umbral_aplicado=None,
                 supuestos=None, medicion=None):
        if not texto or not texto.strip():
            raise ErrorDominio("Una recomendación sin texto no sirve de nada")

        # La regla del proyecto, aplicada en el constructor.
        if not fuente or not str(fuente).strip():
            raise ErrorDominio(
                f"La recomendación «{texto[:60]}...» no declara fuente. "
                f"Una recomendación sin fuente es una opinión: no se guarda.")

        if nivel not in NIVELES:
            raise ErrorDominio(f"Nivel «{nivel}» desconocido. Válidos: {NIVELES}")

        self.texto = texto.strip()
        self.fuente = str(fuente).strip()
        self.nivel = nivel
        self.umbral_aplicado = umbral_aplicado
        self.supuestos = dict(supuestos or {})
        self.medicion = dict(medicion or {})
        self.version_motor = VERSION

    def como_dict(self):
        """Forma que entra en manejo.recomendacion, tal cual."""
        return {
            "texto": self.texto,
            "fuente": self.fuente,
            "nivel": self.nivel,
            "umbral_aplicado": self.umbral_aplicado,
            "supuestos": self.supuestos,
            "medicion": self.medicion,
            "version_motor": self.version_motor,
        }

    def __repr__(self):
        return f"Recomendacion({self.nivel}, {self.texto[:50]!r})"


def ordenar(recomendaciones):
    """Lo que hay que mirar primero, primero."""
    prioridad = {n: i for i, n in enumerate(reversed(NIVELES))}
    return sorted(recomendaciones, key=lambda r: prioridad[r.nivel])
