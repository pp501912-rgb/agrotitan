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


# ═══════════════════════════════════════════════════════════════════════
# PERCENTILES SIN GUARDAR LOS VALORES
#
# El mínimo y el máximo de un mapa de índice casi siempre son un píxel de
# ruido: un reflejo sobre un charco, un pedazo de alambrado. Los que
# describen el lote de verdad son el p5 y el p95, que son las columnas que
# la base tiene reservadas.
#
# Calcularlos exacto exige ordenar todos los valores, y son mil millones.
# Se usa un histograma de rango fijo: el rango declarado del índice,
# repartido en canastos. El error queda acotado por el ancho del canasto
# —con 2.000 canastos sobre un NDVI de -1 a 1, son 0,001— que es dos
# órdenes de magnitud menos que la variabilidad de cualquier cultivo.
#
# Los valores que caen fuera del rango declarado NO se descartan: se
# amontonan en el primer o el último canasto. Descartarlos correría los
# percentiles hacia adentro sin que nadie se entere.
# ═══════════════════════════════════════════════════════════════════════

CANASTOS_POR_OMISION = 2000


class Histograma:
    """Percentiles aproximados, con el error acotado y declarado."""

    __slots__ = ("minimo", "maximo", "canastos", "cuentas", "n")

    def __init__(self, minimo, maximo, canastos=CANASTOS_POR_OMISION):
        if maximo <= minimo:
            raise ValueError(
                f"El rango del histograma es [{minimo}, {maximo}]: el máximo "
                f"tiene que ser mayor que el mínimo.")
        if canastos < 2:
            raise ValueError("Hacen falta al menos dos canastos")

        self.minimo = float(minimo)
        self.maximo = float(maximo)
        self.canastos = int(canastos)
        self.cuentas = [0] * self.canastos
        self.n = 0

    @property
    def ancho_canasto(self):
        """El error máximo de cualquier percentil que devuelva."""
        return (self.maximo - self.minimo) / self.canastos

    def _canasto(self, valor):
        posicion = (valor - self.minimo) / (self.maximo - self.minimo)
        indice = int(posicion * self.canastos)
        # Amontonar afuera, no descartar: un NDVI negativo por agua es un
        # dato real y tiene que pesar en el percentil.
        return min(max(indice, 0), self.canastos - 1)

    def agregar_valores(self, valores):
        """Incorpora valores sueltos. Para pruebas y para pocas muestras."""
        for v in valores:
            self.cuentas[self._canasto(v)] += 1
            self.n += 1
        return self

    def combinar_cuentas(self, cuentas):
        """
        Incorpora el histograma de un bloque entero.

        Es la vía que usa la capa ráster: numpy cuenta el bloque de una y
        acá solo se suman las listas.
        """
        if len(cuentas) != self.canastos:
            raise ValueError(
                f"El bloque trae {len(cuentas)} canastos y el histograma tiene "
                f"{self.canastos}: no se pueden sumar.")

        for i, c in enumerate(cuentas):
            self.cuentas[i] += int(c)
            self.n += int(c)
        return self

    def percentil(self, p):
        """
        Valor por debajo del cual queda el p % de los píxeles.

        Devuelve None si no hay datos. Interpola dentro del canasto, así el
        resultado no salta de a escalones visibles en el informe.
        """
        if not 0 <= p <= 100:
            raise ValueError(f"Percentil {p} fuera de 0-100")
        if self.n == 0:
            return None

        objetivo = (p / 100.0) * self.n
        acumulado = 0

        for i, cuenta in enumerate(self.cuentas):
            if cuenta == 0:
                continue

            if acumulado + cuenta >= objetivo:
                # Dónde cae el objetivo dentro de este canasto.
                faltante = objetivo - acumulado
                fraccion = faltante / cuenta if cuenta else 0.0
                fraccion = min(max(fraccion, 0.0), 1.0)
                return self.minimo + (i + fraccion) * self.ancho_canasto

            acumulado += cuenta

        return self.maximo

    def resumen(self):
        """p5 y p95, que son las columnas que la base espera."""
        if self.n == 0:
            return None
        return {
            "p5": self.percentil(5),
            "p95": self.percentil(95),
            "n": self.n,
            "error_maximo": self.ancho_canasto,
        }

    def __repr__(self):
        return (f"Histograma([{self.minimo}, {self.maximo}], "
                f"{self.canastos} canastos, n={self.n})")
