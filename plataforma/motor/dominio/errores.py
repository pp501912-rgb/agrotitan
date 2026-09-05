# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · ERRORES
#
# El motor prefiere negarse a estimar antes que entregar un número que no
# puede defender. Estas excepciones son ese "no": cada una nombra qué dato
# falta, para que el mensaje sirva en el campo y no solo en el log.
# ═══════════════════════════════════════════════════════════════════════


class ErrorDominio(Exception):
    """Raíz de todos los errores del dominio."""


class DatoInsuficiente(ErrorDominio):
    """
    Falta un dato sin el cual la respuesta sería una invención.

    El caso testigo es la franja de referencia de nitrógeno: sin ella no
    existe el índice de suficiencia, y lo que se puede entregar es un mapa
    de variabilidad, que es otra cosa y así hay que llamarlo.
    """


class PerfilInvalido(ErrorDominio):
    """El YAML de la cámara está mal formado o declara un rol inexistente."""


class IndiceNoDisponible(ErrorDominio):
    """
    La cámara no tiene las bandas que el índice necesita.

    Se lanza en vez de sustituir una banda por otra parecida. El Mavic 3M
    no tiene azul: EVI no se calcula con el verde 'porque está cerca'.
    """


class FormulaInvalida(ErrorDominio):
    """La fórmula del catálogo usa algo que el evaluador no permite."""
