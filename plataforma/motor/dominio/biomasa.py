# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · CALIBRACIÓN DE BIOMASA EN PASTURAS
#
# ACÁ NO HAY NINGUNA FÓRMULA DE BIOMASA, Y ES A PROPÓSITO.
#
# La relación entre un índice espectral y los kilos de materia seca por
# hectárea es LOCAL: depende de la especie, del estado fenológico, de la
# estación y del manejo. La bibliografía regional reporta R² en torno a
# 0,41 en pasturas de verano. Una fórmula precargada daría un número con
# aspecto de dato y sin ningún respaldo.
#
# Lo que sí hay es un ajuste por mínimos cuadrados contra puntos medidos a
# campo —cortes o plato de levante— que devuelve el R² obtenido y AVISA
# cuando el ajuste es pobre. Ese aviso es el producto: saber cuándo NO
# confiar en el mapa vale más que el mapa.
#
# Referencias del método de calibración: trabajos de Facultad de Agronomía
# (UdelaR) sobre estimación de biomasa con dron multiespectral y método de
# rendimiento comparativo (COMPYLD).
# ═══════════════════════════════════════════════════════════════════════

from motor.dominio.errores import DatoInsuficiente, ErrorDominio
from motor.dominio.recomendacion import Recomendacion

FUENTE = ("Calibración local por regresión contra cortes o plato de levante "
          "(método de rendimiento comparativo, COMPYLD). La relación índice-biomasa "
          "no es transferible entre sitios ni entre estaciones.")

# Por debajo de este R² el modelo explica menos de dos tercios de la variación
# y no debería usarse para decidir carga animal. Es una convención de trabajo,
# no una ley: está acá para poder discutirla.
R2_MINIMO_ACEPTABLE = 0.60

# Menos puntos que esto y el R² mide más el azar que la relación. 20-25 puntos
# por potrero es lo recomendado; 8 es el piso absoluto para no fallar en seco.
N_MINIMO = 8


class Calibracion:
    """Una recta índice → kg MS/ha, con su calidad declarada."""

    __slots__ = ("indice", "pendiente", "ordenada", "r2", "rmse", "n",
                 "origen", "indice_min", "indice_max")

    def __init__(self, indice, pendiente, ordenada, r2, rmse, n, origen,
                 indice_min, indice_max):
        self.indice = indice
        self.pendiente = pendiente
        self.ordenada = ordenada
        self.r2 = r2
        self.rmse = rmse
        self.n = n
        self.origen = origen
        # Rango de índice que la calibración vio de verdad. Fuera de él, el
        # modelo extrapola y hay que decirlo.
        self.indice_min = indice_min
        self.indice_max = indice_max

    @property
    def ajuste_pobre(self):
        return self.r2 < R2_MINIMO_ACEPTABLE

    def estimar(self, valor_indice):
        """kg MS/ha para un valor de índice. Nunca negativo."""
        return max(0.0, self.pendiente * valor_indice + self.ordenada)

    def extrapola(self, valor_indice):
        return valor_indice < self.indice_min or valor_indice > self.indice_max

    def como_dict(self):
        return {
            "indice": self.indice,
            "pendiente": self.pendiente,
            "ordenada": self.ordenada,
            "r2": self.r2,
            "rmse_kg_ms_ha": self.rmse,
            "n_muestras": self.n,
            "origen": self.origen,
            "ajuste_pobre": self.ajuste_pobre,
            "rango_indice_calibrado": [self.indice_min, self.indice_max],
        }

    def __repr__(self):
        return (f"Calibracion({self.indice}, R²={self.r2:.3f}, n={self.n}"
                f"{', AJUSTE POBRE' if self.ajuste_pobre else ''})")


def calibrar(puntos, indice="NDVI", origen="corte"):
    """
    Ajusta la recta índice → kg MS/ha por mínimos cuadrados.

    `puntos` es una lista de (valor_indice, kg_ms_ha) medidos el MISMO día
    del vuelo. Devuelve (calibracion, recomendaciones).

    Sin numpy a propósito: son 20-25 puntos, y así este módulo se puede
    probar en cualquier máquina sin instalar nada.
    """
    if len(puntos) < N_MINIMO:
        raise DatoInsuficiente(
            f"Hacen falta al menos {N_MINIMO} puntos para calibrar biomasa y hay "
            f"{len(puntos)}. Lo recomendado son 20-25 por potrero, cubriendo todo el "
            f"rango de biomasa y no solo lo lindo.")

    xs = [float(x) for x, _ in puntos]
    ys = [float(y) for _, y in puntos]
    n = len(puntos)

    media_x = sum(xs) / n
    media_y = sum(ys) / n

    sxx = sum((x - media_x) ** 2 for x in xs)
    sxy = sum((x - media_x) * (y - media_y) for x, y in zip(xs, ys))
    syy = sum((y - media_y) ** 2 for y in ys)

    # OJO: comparar sxx contra cero NO alcanza. Con puntos que tienen el mismo
    # valor de índice, el error de redondeo deja sxx en el orden de 1e-32 en vez
    # de en 0, y la pendiente sale con una magnitud absurda SIN QUE NADIE AVISE.
    # Por eso la comparación es relativa a la escala de los datos, no absoluta.
    rango_x = max(xs) - min(xs)
    escala = max(abs(media_x), 1e-12)

    if sxx <= 0 or rango_x <= escala * 1e-9:
        raise ErrorDominio(
            "Todos los puntos tienen prácticamente el mismo valor de índice: no hay "
            "recta posible. Los puntos de calibración tienen que cubrir un rango de "
            "biomasa, del potrero más pelado al más cargado.")

    pendiente = sxy / sxx
    ordenada = media_y - pendiente * media_x

    residuos = [y - (pendiente * x + ordenada) for x, y in zip(xs, ys)]
    sse = sum(r ** 2 for r in residuos)

    # Con syy == 0 todos los kg MS/ha medidos son iguales: no hay variación que
    # explicar, y un R² ahí no significa nada. Se declara 0 y el aviso salta.
    r2 = 0.0 if syy == 0 else 1.0 - sse / syy
    rmse = (sse / n) ** 0.5

    calibracion = Calibracion(
        indice=indice,
        pendiente=pendiente,
        ordenada=ordenada,
        r2=r2,
        rmse=rmse,
        n=n,
        origen=origen,
        indice_min=min(xs),
        indice_max=max(xs),
    )

    return calibracion, _avisos(calibracion)


def _avisos(c):
    recomendaciones = []

    if c.ajuste_pobre:
        recomendaciones.append(Recomendacion(
            texto=(f"La calibración de biomasa tiene R² = {c.r2:.2f}, por debajo de "
                   f"{R2_MINIMO_ACEPTABLE}. El índice explica menos de dos tercios de la "
                   f"variación en materia seca, con un error típico de {c.rmse:.0f} kg "
                   f"MS/ha. Los kilos de este mapa NO deberían usarse para decidir carga "
                   f"animal: sirven para ver dónde hay más y dónde menos, no cuánto hay. "
                   f"Para mejorarlo: más puntos, cubriendo todo el rango de biomasa, "
                   f"tomados el mismo día del vuelo."),
            fuente=FUENTE,
            nivel="advertencia",
            umbral_aplicado=f"R² < {R2_MINIMO_ACEPTABLE}",
            supuestos={"modelo": "regresión lineal simple", "origen": c.origen},
            medicion=c.como_dict(),
        ))
    else:
        recomendaciones.append(Recomendacion(
            texto=(f"Calibración de biomasa aceptable: R² = {c.r2:.2f} con n = {c.n} "
                   f"puntos de {c.origen}, error típico {c.rmse:.0f} kg MS/ha. Vale para "
                   f"este potrero y esta estación: no se traslada a otro sitio ni a otra "
                   f"época sin recalibrar."),
            fuente=FUENTE,
            nivel="informativo",
            umbral_aplicado=f"R² ≥ {R2_MINIMO_ACEPTABLE}",
            supuestos={"modelo": "regresión lineal simple", "origen": c.origen},
            medicion=c.como_dict(),
        ))

    if c.pendiente <= 0:
        recomendaciones.append(Recomendacion(
            texto=(f"La pendiente de la calibración es {c.pendiente:.1f}: más índice da "
                   f"MENOS biomasa, que es al revés de lo esperado. Revisar si los puntos "
                   f"están bien georreferenciados y si corresponden al mismo día del vuelo."),
            fuente=FUENTE,
            nivel="revisar_a_campo",
            umbral_aplicado="pendiente ≤ 0",
            medicion={"pendiente": c.pendiente},
        ))

    # Un rango estrecho de índice produce un R2 que parece bueno pero que solo
    # vale dentro de esa ventana: la recta no esta anclada, esta apoyada en un
    # punto. El 10% del valor medio es una convencion de trabajo, no una ley.
    rango = c.indice_max - c.indice_min
    escala = max(abs((c.indice_max + c.indice_min) / 2.0), 1e-12)
    if rango < escala * 0.10:
        recomendaciones.append(Recomendacion(
            texto=(f"Los puntos de calibracion cubren un rango de indice muy angosto "
                   f"({c.indice_min:.3f} a {c.indice_max:.3f}). La recta vale dentro de "
                   f"esa ventana y poco mas: fuera de ahi es extrapolacion. Conviene "
                   f"muestrear tambien los sectores mas pelados y los mas cargados."),
            fuente=FUENTE,
            nivel="advertencia",
            umbral_aplicado="rango de indice < 10% del valor medio",
            medicion={"indice_min": c.indice_min, "indice_max": c.indice_max},
        ))

    if c.n < 20:
        recomendaciones.append(Recomendacion(
            texto=(f"La calibración se hizo con {c.n} puntos. Lo recomendado son 20-25 "
                   f"por potrero: con menos, el R² mide tanto el azar como la relación."),
            fuente=FUENTE,
            nivel="sugerencia",
            umbral_aplicado="n < 20",
            medicion={"n": c.n},
        ))

    return recomendaciones
