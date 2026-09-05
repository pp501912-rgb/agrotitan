# ═══════════════════════════════════════════════════════════════════════
# LÍNEA DE COMANDOS
#
# Se usa argparse, de la biblioteca estándar, y no click. El motivo es
# concreto: así los comandos que solo tocan el dominio —listar índices,
# calibrar biomasa, presupuestar forraje— funcionan en cualquier máquina con
# Python, sin instalar nada. Sirven para revisar un número en el campo desde
# una notebook que no tiene el entorno armado.
#
# Los comandos que tocan rásters importan numpy y rasterio DENTRO de la
# función, no arriba del archivo. Si no están instalados, falla ese comando
# con un mensaje claro, no el programa entero al arrancar.
# ═══════════════════════════════════════════════════════════════════════

import argparse
import csv
import json
import os
import sys

from motor.dominio import biomasa, carga, catalogo, nitrogeno, perfil
from motor.dominio.errores import ErrorDominio
from motor.version import VERSION


def _falta_entorno(que):
    return ErrorDominio(
        f"Este comando necesita {que}, que no está instalado. Armá el entorno con:\n"
        f"    conda env create -f entorno.yml && conda activate plataforma")


# ── listar-indices ─────────────────────────────────────────────────────

def cmd_listar_indices(args):
    p = perfil.cargar(args.perfil)
    disponibles, no_disponibles = catalogo.disponibilidad(p)

    print(f"\n{p.marca} {p.modelo}  ({p.id})")
    print(f"Bandas: {', '.join(sorted(p.roles))}")
    print(f"Panel de reflectancia: {'sí' if p.tiene_panel else 'no'} · "
          f"Sensor de luz: {'sí' if p.tiene_dls else 'no'}")

    print(f"\nSE PUEDEN CALCULAR ({len(disponibles)}):")
    for nombre in sorted(disponibles):
        print(f"  {nombre:8s} {disponibles[nombre].nombre_largo}")

    if no_disponibles:
        print(f"\nNO SE PUEDEN CALCULAR ({len(no_disponibles)}):")
        for nombre in sorted(no_disponibles):
            print(f"  {nombre:8s} {no_disponibles[nombre]}")
            alternativas = catalogo.alternativas(nombre, p)
            if alternativas:
                print(f"           en su lugar, publicados para estas bandas: "
                      f"{', '.join(alternativas)}")
    print()
    return 0


# ── calibrar-biomasa ───────────────────────────────────────────────────

def cmd_calibrar_biomasa(args):
    """
    Ajusta la relación índice -> kg MS/ha con puntos medidos a campo.

    El CSV lleva dos columnas: valor del índice y kg de materia seca por
    hectárea. Con encabezado o sin él.
    """
    puntos = []
    with open(args.puntos, encoding="utf-8") as f:
        for fila in csv.reader(f):
            if len(fila) < 2:
                continue
            try:
                puntos.append((float(fila[0]), float(fila[1])))
            except ValueError:
                continue          # encabezado o fila vacía

    calibracion, avisos = biomasa.calibrar(puntos, indice=args.indice,
                                           origen=args.origen)

    print(f"\nCalibración de biomasa · {calibracion.indice}")
    print(f"  kg MS/ha = {calibracion.pendiente:.1f} x {calibracion.indice} "
          f"{calibracion.ordenada:+.1f}")
    print(f"  R² = {calibracion.r2:.3f}   error típico = "
          f"{calibracion.rmse:.0f} kg MS/ha   n = {calibracion.n}")
    print(f"  rango calibrado: {calibracion.indice_min:.3f} a "
          f"{calibracion.indice_max:.3f}")

    for aviso in avisos:
        print(f"\n  [{aviso.nivel.upper()}] {aviso.texto}")

    print()
    return 2 if calibracion.ajuste_pobre else 0


# ── forraje ────────────────────────────────────────────────────────────

def cmd_forraje(args):
    dias, detalle, avisos = carga.dias_de_pastoreo(
        args.kg_ms_ha, args.superficie_ha, args.cabezas, args.peso,
        carga.Supuestos(eficiencia_cosecha=args.eficiencia,
                        remanente_kg_ms_ha=args.remanente,
                        consumo_pct_peso_vivo=args.consumo))

    print(f"\nForraje utilizable: {detalle['kg_ms_utilizable_total']:,.0f} kg MS")
    print(f"Consumo del lote:   {detalle['consumo_diario_kg_ms']:,.0f} kg MS/día")
    print(f"Alcanza para:       {dias} días")
    print(f"Carga instantánea:  {detalle['carga_instantanea_cab_ha']} cab/ha")
    print(f"\nSupuestos: {json.dumps(detalle['supuestos'], ensure_ascii=False)}")

    for aviso in avisos:
        print(f"\n[{aviso.nivel.upper()}] {aviso.texto}")
    print()
    return 0


# ── suficiencia ────────────────────────────────────────────────────────

def cmd_suficiencia(args):
    """Dosis de nitrógeno para un NDRE de zona contra el de la franja."""
    if args.referencia is None:
        print("\nNo hay franja de referencia: no se puede calcular una dosis.")
        print("Lo que se puede hacer sin ella es un mapa de variabilidad, que "
              "muestra dónde el lote es distinto\npero no cuánto fertilizar. "
              "Para prescribir, instalá una franja sobrefertilizada al menos "
              "dos\nsemanas antes del próximo vuelo.\n")
        return 1

    si = nitrogeno.indice_suficiencia(args.ndre, args.referencia)
    dosis, motivo = nitrogeno.dosis(si)

    print(f"\nÍndice de suficiencia: {si:.3f}")
    print(f"Dosis:                 {dosis:.0f} kg N/ha")
    print(f"Por qué:               {motivo}\n")
    return 0


# ── procesar ───────────────────────────────────────────────────────────

def cmd_procesar(args):
    """Pipeline completo. Necesita el entorno con numpy y rasterio."""
    try:
        from motor import canalizacion
    except ImportError as e:              # pragma: no cover
        raise _falta_entorno("numpy y rasterio") from e

    return canalizacion.procesar(
        ruta_ortomosaico=args.ortomosaico,
        id_perfil=args.perfil,
        directorio_salida=args.salida,
        indices=args.indices.split(",") if args.indices else None,
        k_zonas=args.zonas,
        ndre_referencia=args.ndre_referencia,
        guardar_en_base=args.guardar_en_base,
        metadatos={
            "organizacion": args.organizacion,
            "organizacion_id": args.organizacion_id,
            "campo": args.campo,
            "lote": args.lote,
            "fecha": args.fecha,
            "calibracion": args.calibracion,
        },
    )


# ── guardar ────────────────────────────────────────────────────────────

def cmd_guardar(args):
    """Sube a la base una corrida que ya está procesada en disco."""
    from motor import persistencia
    from motor.dominio import manifiesto as manifiestos

    man = manifiestos.leer(args.vuelo)

    if not man.reconstruible:
        raise ErrorDominio(
            f"El manifiesto de {args.vuelo} no tiene vuelo_id o no tiene huella: "
            f"describe el vuelo pero no alcanza para crear las filas. Se arregla "
            f"volviendo a procesar el vuelo con esta versión del motor.")

    from motor.reconstruir import _contexto
    plan = persistencia.plan_de_escritura(
        _contexto(man), ids={"vuelo_id": man.vuelo_id,
                             "organizacion_id": args.organizacion_id})

    print(f"\nPlan de escritura para {man.lote} · {man.fecha}")
    for nombre, cuenta in persistencia.resumen(plan).items():
        print(f"  {cuenta:3d}  {nombre}")

    if args.simular:
        print("\n  (--simular: no se escribió nada)\n")
        return 0

    try:
        from motor.base import conexion
    except ImportError as e:
        raise _falta_entorno("psycopg") from e

    with conexion.conectar(args.organizacion_id) as cx:
        with cx.cursor() as cur:
            persistencia.ejecutar(plan, cur)
        cx.commit()

    print(f"\n  Guardado: {len(plan)} operaciones\n")
    return 0


# ── reconstruir ────────────────────────────────────────────────────────

def cmd_reconstruir(args):
    """Repuebla la base recorriendo los manifiestos de las carpetas."""
    from motor import reconstruir

    hashes = ()
    if not args.simular:
        try:
            from motor.base import conexion
            from motor.base.repositorio import SENTENCIAS
        except ImportError as e:
            raise _falta_entorno("psycopg") from e

        with conexion.conectar(args.organizacion_id) as cx:
            with cx.cursor() as cur:
                cur.execute("SELECT sha256 FROM vuelo.ortomosaico")
                hashes = {fila[0] for fila in cur.fetchall()}

    hallazgos = reconstruir.planificar(args.datos, hashes)
    print(reconstruir.informe(hallazgos))

    if args.simular:
        print("\n  (--simular: no se escribió nada)\n")
        return 0

    from motor.base import conexion
    with conexion.conectar(args.organizacion_id) as cx:
        with cx.cursor() as cur:
            cuenta = reconstruir.aplicar(hallazgos, cur)
        cx.commit()

    print(f"\n  {cuenta}\n")
    return 1 if cuenta.get("error") else 0


# ── serie ──────────────────────────────────────────────────────────────

def cmd_serie(args):
    """
    Evolución de un índice en el tiempo.

    Usa la vista indice.serie_comparable, que EXCLUYE los vuelos sin
    calibración radiométrica. No hay una versión de este comando que los
    incluya, y esa ausencia es deliberada: comparar números digitales entre
    fechas es comparar la nubosidad de cada día.
    """
    try:
        from motor.base import conexion, repositorio
    except ImportError as e:
        raise _falta_entorno("psycopg") from e

    with conexion.conectar(args.organizacion_id) as cx:
        with cx.cursor() as cur:
            filas = repositorio.serie_temporal(cur, args.lote, args.indice)

    if not filas:
        print(f"\nNo hay vuelos comparables de este lote con {args.indice}.")
        print("Puede ser que no haya vuelos, o que los que hay no tengan "
              "calibración\nradiométrica y por eso no entren en una serie.\n")
        return 1

    print(f"\nSerie de {args.indice} · lote {args.lote}\n")
    print(f"  {'fecha':12s} {'media':>8s} {'p5':>8s} {'p95':>8s}  calibración")
    for fecha, indice, media, p5, p95, metodo in filas:
        print(f"  {str(fecha):12s} {media or 0:8.3f} {p5 or 0:8.3f} "
              f"{p95 or 0:8.3f}  {metodo}")
    print()
    return 0


# ── verificar-entorno ──────────────────────────────────────────────────

def cmd_verificar_entorno(_args):
    print(f"\nMotor v{VERSION} · Python {sys.version.split()[0]}\n")

    modulos = [
        ("yaml", "perfiles de cámara", True),
        ("numpy", "cálculo sobre rásters", False),
        ("rasterio", "lectura y escritura de GeoTIFF", False),
        ("sklearn", "k-means de zonificación", False),
        ("scipy", "limpieza de zonas chicas", False),
        ("shapely", "superficies de las zonas", False),
        ("shapefile", "exportación a shapefile (pyshp)", False),
        ("psycopg", "base de datos", False),
    ]

    faltan_criticos = False
    for nombre, para_que, critico in modulos:
        try:
            __import__(nombre)
            estado = "OK   "
        except ImportError:
            estado = "FALTA"
            if critico:
                faltan_criticos = True
        marca = " (imprescindible)" if critico else ""
        print(f"  {estado}  {nombre:11s} {para_que}{marca}")

    print(f"\n  Perfiles de cámara: {', '.join(perfil.listar())}")
    print(f"  Índices en el catálogo: {len(catalogo.cargar())}\n")

    return 1 if faltan_criticos else 0


# ── armado del parser ──────────────────────────────────────────────────

def construir_parser():
    p = argparse.ArgumentParser(
        prog="motor",
        description="Análisis multiespectral para agricultura de precisión.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Un modelo sin supuestos declarados es una opinión con decimales.")
    p.add_argument("--version", action="version", version=f"motor {VERSION}")

    sub = p.add_subparsers(dest="comando", required=True)

    s = sub.add_parser("listar-indices",
                       help="qué índices permite una cámara, y cuáles no")
    s.add_argument("--perfil", required=True, choices=perfil.listar())
    s.set_defaults(func=cmd_listar_indices)

    s = sub.add_parser("calibrar-biomasa",
                       help="ajusta índice -> kg MS/ha con puntos de campo")
    s.add_argument("--puntos", required=True,
                   help="CSV con dos columnas: índice, kg MS/ha")
    s.add_argument("--indice", default="NDVI")
    s.add_argument("--origen", default="corte",
                   choices=("corte", "plato", "mixto"))
    s.set_defaults(func=cmd_calibrar_biomasa)

    s = sub.add_parser("forraje", help="días de pastoreo de un potrero")
    s.add_argument("--kg-ms-ha", type=float, required=True, dest="kg_ms_ha")
    s.add_argument("--superficie-ha", type=float, required=True,
                   dest="superficie_ha")
    s.add_argument("--cabezas", type=int, required=True)
    s.add_argument("--peso", type=float, required=True,
                   help="peso promedio en kg")
    s.add_argument("--eficiencia", type=float, default=0.60)
    s.add_argument("--remanente", type=float, default=1200.0)
    s.add_argument("--consumo", type=float, default=2.8,
                   help="consumo diario como %% del peso vivo")
    s.set_defaults(func=cmd_forraje)

    s = sub.add_parser("suficiencia",
                       help="dosis de N para un NDRE contra la franja")
    s.add_argument("--ndre", type=float, required=True)
    s.add_argument("--referencia", type=float, default=None,
                   help="NDRE de la franja sobrefertilizada")
    s.set_defaults(func=cmd_suficiencia)

    s = sub.add_parser("procesar", help="pipeline completo sobre un ortomosaico")
    s.add_argument("--ortomosaico", required=True)
    s.add_argument("--perfil", required=True, choices=perfil.listar())
    s.add_argument("--salida", required=True)
    s.add_argument("--indices", default="NDVI,NDRE,GNDVI")
    s.add_argument("--zonas", type=int, default=4)
    s.add_argument("--ndre-referencia", type=float, default=None,
                   dest="ndre_referencia")
    s.add_argument("--organizacion", default="sin-organizacion")
    s.add_argument("--campo", default="sin-campo")
    s.add_argument("--lote", default="sin-lote")
    s.add_argument("--fecha", default=None)
    s.add_argument("--calibracion", default="ninguna",
                   choices=("ninguna", "panel", "dls", "panel+dls"))
    s.add_argument("--guardar-en-base", action="store_true",
                   dest="guardar_en_base",
                   help="además de los archivos, escribe en PostGIS")
    s.add_argument("--organizacion-id", default=None, dest="organizacion_id",
                   help="uuid de la organización; obligatorio con --guardar-en-base")
    s.set_defaults(func=cmd_procesar)

    s = sub.add_parser("guardar",
                       help="sube a la base una corrida ya procesada en disco")
    s.add_argument("--vuelo", required=True, help="carpeta con el manifiesto")
    s.add_argument("--organizacion-id", required=True, dest="organizacion_id")
    s.add_argument("--simular", action="store_true",
                   help="muestra el plan sin escribir nada")
    s.set_defaults(func=cmd_guardar)

    s = sub.add_parser("reconstruir",
                       help="repuebla la base desde los manifiestos del disco")
    s.add_argument("--datos", required=True, help="raíz del árbol de datos")
    s.add_argument("--organizacion-id", required=True, dest="organizacion_id")
    s.add_argument("--simular", action="store_true",
                   help="muestra qué se encontró sin escribir nada")
    s.set_defaults(func=cmd_reconstruir)

    s = sub.add_parser("serie",
                       help="evolución de un índice, solo con vuelos comparables")
    s.add_argument("--lote", required=True)
    s.add_argument("--indice", default="NDRE")
    s.add_argument("--organizacion-id", required=True, dest="organizacion_id")
    s.set_defaults(func=cmd_serie)

    s = sub.add_parser("verificar-entorno",
                       help="qué está instalado y qué falta")
    s.set_defaults(func=cmd_verificar_entorno)

    return p


def main(argv=None):
    parser = construir_parser()
    args = parser.parse_args(argv)

    try:
        return args.func(args)
    except ErrorDominio as e:
        # Los errores del dominio son mensajes para una persona, no trazas.
        print(f"\n{e}\n", file=sys.stderr)
        return 1
    except FileNotFoundError as e:
        print(f"\nNo se encontró el archivo: {e.filename}\n", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
