# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · CATÁLOGO DE ÍNDICES Y DISPONIBILIDAD POR CÁMARA
#
# Acá vive la regla que define el agnosticismo de sensor: para cada cámara,
# el motor calcula qué índices PUEDE y qué índices NO PUEDE calcular, con el
# motivo. Nunca sustituye una banda faltante por otra parecida.
#
# El caso testigo: el DJI Mavic 3M no tiene banda azul, así que EVI y ARVI
# quedan fuera. Lo correcto NO es calcular el EVI con el verde: es decir que
# no se puede, y ofrecer el EVI2, que es la versión publicada para sensores
# sin azul. Sustituir bandas produce un número que parece un EVI y no lo es.
#
# Los roles que cada índice necesita NO están escritos a mano en el JSON: se
# deducen de la propia fórmula. Así no pueden quedar desactualizados cuando
# alguien edite una fórmula.
# ═══════════════════════════════════════════════════════════════════════

import json
import os

from motor.dominio import formula as formulas
from motor.dominio.errores import IndiceNoDisponible

RUTA_CATALOGO = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "catalogo", "indices.json")


class Indice:
    __slots__ = ("nombre", "nombre_largo", "formula", "constantes",
                 "rango", "fuente", "uso")

    def __init__(self, nombre, datos):
        self.nombre = nombre
        self.nombre_largo = datos["nombre_largo"]
        self.formula = datos["formula"]
        self.constantes = datos.get("constantes", {})
        self.rango = tuple(datos["rango"])
        self.fuente = datos["fuente"]
        self.uso = datos.get("uso", "")

    @property
    def roles_requeridos(self):
        """Deducidos de la fórmula, descontando las constantes declaradas."""
        return formulas.nombres(self.formula) - set(self.constantes)

    @property
    def escala(self):
        """Factor de escala con el que este índice se guarda en disco."""
        return escala_de_almacenamiento(self.rango)

    def calcular(self, bandas):
        """
        Evalúa el índice.

        `bandas` mapea rol → valor. Los valores pueden ser números o arrays
        de numpy: el evaluador solo aplica operadores.
        """
        faltantes = self.roles_requeridos - set(bandas)
        if faltantes:
            raise IndiceNoDisponible(
                f"{self.nombre} necesita {sorted(self.roles_requeridos)} y falta "
                f"{sorted(faltantes)}")

        contexto = dict(self.constantes)
        contexto.update(bandas)
        return formulas.evaluar(self.formula, contexto)

    def __repr__(self):
        return f"Indice({self.nombre!r})"


def cargar(ruta=None):
    """Carga el catálogo entero. Devuelve {nombre: Indice}."""
    with open(ruta or RUTA_CATALOGO, encoding="utf-8") as f:
        datos = json.load(f)

    return {
        nombre: Indice(nombre, cuerpo)
        for nombre, cuerpo in datos.items()
        if not nombre.startswith("_")          # las claves con _ son comentarios
    }


def disponibilidad(perfil, catalogo=None):
    """
    Qué índices se pueden calcular con esta cámara, y por qué no los otros.

    Devuelve (disponibles, no_disponibles) donde no_disponibles mapea
    nombre → motivo legible. Ese motivo va al informe: el usuario tiene que
    ver qué NO se pudo calcular, no solo lo que sí.
    """
    catalogo = catalogo if catalogo is not None else cargar()
    roles = perfil.roles

    disponibles, no_disponibles = {}, {}

    for nombre, indice in catalogo.items():
        faltantes = indice.roles_requeridos - roles
        if faltantes:
            no_disponibles[nombre] = (
                f"falta la banda «{'», «'.join(sorted(faltantes))}» "
                f"en {perfil.marca} {perfil.modelo}")
        else:
            disponibles[nombre] = indice

    return disponibles, no_disponibles


def alternativas(nombre_indice, perfil, catalogo=None):
    """
    Sugiere índices disponibles que sirvan para lo mismo que uno que no lo está.

    No es una sustitución de bandas: es ofrecer otro índice PUBLICADO que
    resuelve el mismo problema con las bandas que hay. El EVI2 existe
    precisamente porque alguien necesitó un EVI sin azul.
    """
    catalogo = catalogo if catalogo is not None else cargar()
    disponibles, _ = disponibilidad(perfil, catalogo)

    equivalencias = {
        "EVI": ["EVI2", "OSAVI", "MSAVI2"],
        "ARVI": ["NDVI", "OSAVI"],
        "NDRE": ["GNDVI", "CIg"],      # cuando no hay borde rojo
        "CIre": ["CIg"],
    }

    return [n for n in equivalencias.get(nombre_indice, []) if n in disponibles]


# ── Representación en disco ────────────────────────────────────────────
# Los índices se guardan como enteros de 16 bits con signo. Cuál es el factor
# de escala depende del rango de cada índice: un NDVI (-1 a 1) entra cómodo
# con 10.000, pero un CIre (0 a 15) desbordaría —15 x 10.000 no cabe en
# int16—, así que usa 1.000. El factor se guarda con el archivo y en
# indice.capa.escala: sin él, el entero no se interpreta.

# No se usa todo el rango de int16: queda margen para valores que se salgan
# un poco del rango teórico por ruido del sensor.
TECHO_INT16 = 32000


def escala_de_almacenamiento(rango):
    """
    Factor de escala para guardar un índice en int16 sin desbordar.

    Se elige la potencia de diez más grande que entre. Potencias de diez, y no
    el máximo exacto, porque un factor de 10.000 o de 1.000 se lee de un
    vistazo y estos archivos los va a abrir alguien en QGIS.
    """
    maximo = max(abs(float(rango[0])), abs(float(rango[1])))
    if maximo <= 0:
        return 10000

    escala = 10000
    while escala > 1 and maximo * escala > TECHO_INT16:
        escala //= 10

    return escala
