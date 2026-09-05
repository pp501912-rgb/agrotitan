# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · ESTADÍSTICA EN UNA PASADA
#
# Para resumir un mapa de índice hay que recorrerlo por bloques —no entra en
# memoria— y combinar los resúmenes parciales. Sumar los cuadrados de frente
# pierde precisión cuando hay millones de valores parecidos, que es
# exactamente el caso de un NDVI: casi todos entre 0,3 y 0,9.
#
# Se usa el método de Chan, Golub y LeVeque para combinar. La aritmética está
# acá, en el dominio y sin numpy, porque es donde se esconden los errores y
# porque así se puede probar sin instalar nada. La capa ráster solo aporta los
# resúmenes parciales de cada bloque.
#
# Fuente: Chan, Golub y LeVeque (1983), "Algorithms for computing the sample
# variance", The American Statistician 37(3).
# ═══════════════════════════════════════════════════════════════════════


class Acumulador:
    """Media, desvío, mínimo y máximo, sin guardar los valores."""

    __slots__ = ("n", "media", "m2", "minimo", "maximo")

    def __init__(self):
        self.n = 0
        self.media = 0.0
        self.m2 = 0.0                      # suma de cuadrados de las diferencias
        self.minimo = float("inf")
        self.maximo = float("-inf")

    def combinar(self, n, media, m2, minimo=None, maximo=None):
        """
        Incorpora el resumen de un bloque.

        `m2` es la suma de (x - media_del_bloque)² dentro del bloque.
        """
        if n <= 0:
            return self

        n_previo = self.n
        n_total = n_previo + n
        delta = media - self.media

        self.media += delta * n / n_total
        self.m2 += m2 + delta * delta * n_previo * n / n_total
        self.n = n_total

        if minimo is not None:
            self.minimo = min(self.minimo, minimo)
        if maximo is not None:
            self.maximo = max(self.maximo, maximo)

        return self

    def resumen(self):
        """Resultado final, o None si no hubo ningún valor válido."""
        if self.n == 0:
            return None

        varianza = self.m2 / self.n if self.n > 1 else 0.0
        return {
            "n": self.n,
            "media": self.media,
            "desvio": varianza ** 0.5,
            "minimo": self.minimo,
            "maximo": self.maximo,
        }

    def __repr__(self):
        return f"Acumulador(n={self.n}, media={self.media:.4f})"


def resumir(valores):
    """
    Resumen de una secuencia chica, en Python puro.

    Sirve para las pruebas y para las estadísticas zonales de pocas zonas.
    Sobre un ráster se usa el Acumulador con resúmenes por bloque.
    """
    valores = list(valores)
    if not valores:
        return None

    n = len(valores)
    media = sum(valores) / n
    m2 = sum((v - media) ** 2 for v in valores)

    acc = Acumulador()
    acc.combinar(n, media, m2, min(valores), max(valores))
    return acc.resumen()
