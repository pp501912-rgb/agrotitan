# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · MANIFIESTO DEL VUELO
#
# El seguro de vida del proyecto. Cada carpeta de vuelo lleva un
# manifiesto.json que la describe entera: organización, campo, lote, fecha,
# cámara, calibración, salidas producidas y versión del motor.
#
# Si la base de datos se corrompe o se pierde, un script la repuebla
# recorriendo las carpetas y leyendo los manifiestos. En un proyecto que
# mantiene una sola persona, eso vale más que cualquier optimización.
#
# Por eso el manifiesto NO guarda ids de la base: guarda los datos. Un id
# huérfano no reconstruye nada.
# ═══════════════════════════════════════════════════════════════════════

import json
import os
from datetime import date, datetime

from motor.dominio.errores import ErrorDominio
from motor.version import VERSION

NOMBRE_ARCHIVO = "manifiesto.json"

# Sin estos campos el manifiesto no reconstruye nada, así que no se escribe.
CAMPOS_OBLIGATORIOS = ("organizacion", "campo", "lote", "fecha", "perfil_camara")


class Manifiesto:
    def __init__(self, organizacion, campo, lote, fecha, perfil_camara,
                 calibracion=None, comparable=False, indices=None,
                 salidas=None, parametros=None, version_motor=None,
                 creado=None, vuelo_id=None, geo=None):
        self.organizacion = organizacion
        self.campo = campo
        self.lote = lote
        self.fecha = fecha
        self.perfil_camara = perfil_camara

        # Método de calibración radiométrica: 'ninguna', 'panel', 'dls',
        # 'panel+dls'. Es lo que decide si el vuelo entra o no en una serie.
        self.calibracion = calibracion or "ninguna"

        self.comparable = comparable
        self.indices = list(indices or [])
        self.salidas = dict(salidas or {})
        self.parametros = dict(parametros or {})
        self.version_motor = version_motor or VERSION
        self.creado = creado or datetime.now().isoformat(timespec="seconds")

        # El identificador del vuelo se genera ANTES de procesar, para que la
        # carpeta en disco y la fila en la base sean la misma cosa. Sin esto,
        # reconstruir tendría que inventar un id nuevo y la carpeta dejaría de
        # apuntar a nada.
        self.vuelo_id = vuelo_id

        # Lo que hace falta para volver a crear el lote si no existe: sistema
        # de coordenadas, zona UTM, huella del vuelo y superficie. Sin este
        # bloque el manifiesto describe el vuelo pero no alcanza para
        # reconstruir la base, que es toda la razón de que exista.
        self.geo = dict(geo or {})

        self._validar()

    def _validar(self):
        for campo in CAMPOS_OBLIGATORIOS:
            if not getattr(self, campo):
                raise ErrorDominio(
                    f"El manifiesto no declara «{campo}». Sin eso la carpeta no "
                    f"reconstruye la base, que es toda la razón de que exista.")

        # La misma regla que la restricción chk_comparable de la base, aplicada
        # antes de escribir el archivo: un vuelo sin calibración radiométrica no
        # produce reflectancia comparable entre fechas.
        if self.comparable and self.calibracion == "ninguna":
            raise ErrorDominio(
                "El manifiesto se declara comparable pero sin calibración "
                "radiométrica. Sin panel ni DLS lo que hay son números digitales, "
                "que cambian con la nubosidad: no se pueden comparar entre fechas.")

    def como_dict(self):
        f = self.fecha.isoformat() if isinstance(self.fecha, date) else self.fecha
        return {
            "organizacion": self.organizacion,
            "campo": self.campo,
            "lote": self.lote,
            "fecha": f,
            "perfil_camara": self.perfil_camara,
            "calibracion": self.calibracion,
            "comparable": self.comparable,
            "indices": self.indices,
            "salidas": self.salidas,
            "parametros": self.parametros,
            "version_motor": self.version_motor,
            "creado": self.creado,
            "vuelo_id": self.vuelo_id,
            "geo": self.geo,
        }

    def __eq__(self, otro):
        return isinstance(otro, Manifiesto) and self.como_dict() == otro.como_dict()

    @property
    def reconstruible(self):
        """
        Si este manifiesto alcanza, solo, para volver a crear las filas.

        Un manifiesto sin huella ni identificador de vuelo describe lo que
        pasó pero no permite rehacerlo: vale la pena saberlo antes de que la
        base se pierda, no después.
        """
        return bool(self.vuelo_id and self.geo.get("footprint"))

    def __repr__(self):
        return f"Manifiesto({self.lote!r}, {self.fecha}, {self.perfil_camara!r})"


def desde_dict(datos):
    return Manifiesto(**datos)


def escribir(manifiesto, directorio):
    """Escribe el manifiesto en la carpeta del vuelo. Devuelve la ruta."""
    os.makedirs(directorio, exist_ok=True)
    ruta = os.path.join(directorio, NOMBRE_ARCHIVO)

    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(manifiesto.como_dict(), f, ensure_ascii=False, indent=2)
        f.write("\n")

    return ruta


def leer(directorio):
    """Lee el manifiesto de una carpeta de vuelo."""
    ruta = os.path.join(directorio, NOMBRE_ARCHIVO)

    if not os.path.exists(ruta):
        raise ErrorDominio(f"No hay {NOMBRE_ARCHIVO} en {directorio}")

    with open(ruta, encoding="utf-8") as f:
        return desde_dict(json.load(f))


def recorrer(raiz):
    """
    Encuentra todos los manifiestos bajo una raíz de datos.

    Es la base del script de reconstrucción: recorrer, leer, insertar.
    """
    encontrados = []
    for actual, _, archivos in os.walk(raiz):
        if NOMBRE_ARCHIVO in archivos:
            encontrados.append((actual, leer(actual)))
    return sorted(encontrados, key=lambda par: par[0])


def ruta_de_vuelo(raiz, organizacion, campo, lote, fecha, vuelo_id):
    """
    La convención de rutas del proyecto, en un solo lugar.

        <raiz>/<organizacion>/<campo>/<lote>/<AAAA-MM-DD>_<vuelo_id>/

    Está acá y no repetida por ahí para que cambiarla sea cambiar una función.
    """
    f = fecha.isoformat() if isinstance(fecha, date) else str(fecha)
    return os.path.join(raiz, str(organizacion), str(campo), str(lote), f"{f}_{vuelo_id}")
