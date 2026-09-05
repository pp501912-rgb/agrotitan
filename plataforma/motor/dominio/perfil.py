# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · PERFILES DE CÁMARA
#
# Un perfil dice qué rol de banda ocupa cada posición del ortomosaico.
# Es TODO lo que el motor sabe de la cámara, y es la razón por la que
# soportar un sensor nuevo es escribir un YAML y no tocar código.
#
# El vocabulario de roles es el common_name de la extensión EO de STAC.
# Elegirlo no fue capricho: es el mismo que usan los catálogos satelitales,
# así que el día que se quiera cruzar un vuelo con una imagen Sentinel-2 no
# hay que traducir nada.
# ═══════════════════════════════════════════════════════════════════════

import os

import yaml

from motor.dominio.errores import PerfilInvalido

# Vocabulario cerrado. Si alguien escribe 'infrarrojo' en un YAML, el perfil
# se rechaza al cargar en vez de fallar tres pasos después con un KeyError.
ROLES_VALIDOS = frozenset({
    "coastal", "blue", "green", "yellow", "red", "rededge",
    "nir", "nir08", "nir09", "pan", "lwir",
})

# Roles que no participan de ningún índice espectral: la pancromática sirve
# para afinar resolución y la térmica es otro problema (estrés hídrico).
ROLES_NO_ESPECTRALES = frozenset({"pan", "lwir"})

DIRECTORIO_PERFILES = os.path.join(os.path.dirname(os.path.dirname(__file__)), "perfiles")


class Banda:
    __slots__ = ("orden", "rol", "lambda_nm", "fwhm_nm")

    def __init__(self, orden, rol, lambda_nm, fwhm_nm=None):
        self.orden = orden
        self.rol = rol
        self.lambda_nm = lambda_nm
        self.fwhm_nm = fwhm_nm

    def __repr__(self):
        return f"Banda({self.orden}, {self.rol!r}, {self.lambda_nm})"


class Perfil:
    """Una cámara, vista como un mapa de rol → número de banda."""

    def __init__(self, id, marca, modelo, bandas, tiene_dls=False,
                 tiene_panel=False, notas=None):
        self.id = id
        self.marca = marca
        self.modelo = modelo
        self.bandas = bandas
        self.tiene_dls = tiene_dls
        self.tiene_panel = tiene_panel
        self.notas = notas

    @property
    def roles(self):
        """Roles presentes, sin los que no sirven para índices."""
        return {b.rol for b in self.bandas} - ROLES_NO_ESPECTRALES

    def orden_de(self, rol):
        """Número de banda (1-based) del rol pedido."""
        for b in self.bandas:
            if b.rol == rol:
                return b.orden
        raise PerfilInvalido(f"El perfil «{self.id}» no tiene banda con rol «{rol}»")

    def tiene(self, rol):
        return any(b.rol == rol for b in self.bandas)

    def __repr__(self):
        return f"Perfil({self.id!r}, {len(self.bandas)} bandas)"


def desde_dict(datos):
    """Valida y construye un perfil a partir del contenido del YAML."""
    for clave in ("id", "marca", "modelo", "bandas"):
        if clave not in datos:
            raise PerfilInvalido(f"Falta la clave obligatoria «{clave}»")

    if not datos["bandas"]:
        raise PerfilInvalido(f"El perfil «{datos['id']}» no declara ninguna banda")

    bandas = []
    vistos_orden, vistos_rol = set(), set()

    for b in datos["bandas"]:
        for clave in ("orden", "rol", "lambda_nm"):
            if clave not in b:
                raise PerfilInvalido(
                    f"En «{datos['id']}», una banda no declara «{clave}»: {b!r}")

        if b["rol"] not in ROLES_VALIDOS:
            raise PerfilInvalido(
                f"En «{datos['id']}», el rol «{b['rol']}» no existe. "
                f"Vocabulario válido (STAC EO): {sorted(ROLES_VALIDOS)}")

        if b["orden"] in vistos_orden:
            raise PerfilInvalido(
                f"En «{datos['id']}», la banda {b['orden']} está declarada dos veces")

        # Dos bandas con el mismo rol harían ambiguo el mapa rol → banda, que es
        # justamente lo único que el motor usa. Se rechaza al cargar.
        if b["rol"] in vistos_rol:
            raise PerfilInvalido(
                f"En «{datos['id']}», el rol «{b['rol']}» está declarado dos veces")

        vistos_orden.add(b["orden"])
        vistos_rol.add(b["rol"])
        bandas.append(Banda(b["orden"], b["rol"], b["lambda_nm"], b.get("fwhm_nm")))

    bandas.sort(key=lambda b: b.orden)

    return Perfil(
        id=datos["id"],
        marca=datos["marca"],
        modelo=datos["modelo"],
        bandas=bandas,
        tiene_dls=datos.get("tiene_dls", False),
        tiene_panel=datos.get("tiene_panel", False),
        notas=datos.get("notas"),
    )


def cargar(id_perfil, directorio=None):
    """Carga un perfil por su id (el nombre del archivo, sin .yaml)."""
    directorio = directorio or DIRECTORIO_PERFILES
    ruta = os.path.join(directorio, f"{id_perfil}.yaml")

    if not os.path.exists(ruta):
        raise PerfilInvalido(
            f"No existe el perfil «{id_perfil}». Disponibles: {sorted(listar(directorio))}")

    with open(ruta, encoding="utf-8") as f:
        datos = yaml.safe_load(f)

    perfil = desde_dict(datos)

    # El id del archivo manda: si no coinciden, algo se copió y no se renombró.
    if perfil.id != id_perfil:
        raise PerfilInvalido(
            f"El archivo {id_perfil}.yaml declara id «{perfil.id}». Tienen que coincidir.")

    return perfil


def listar(directorio=None):
    """Ids de todos los perfiles disponibles."""
    directorio = directorio or DIRECTORIO_PERFILES
    return sorted(
        n[:-5] for n in os.listdir(directorio) if n.endswith(".yaml")
    )
