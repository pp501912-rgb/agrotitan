# ═══════════════════════════════════════════════════════════════════════
# INFORME HTML
#
# Un archivo autocontenido: sin CSS externo, sin fuentes remotas, sin
# JavaScript. Se abre desde una carpeta compartida, se manda por correo o se
# imprime, y se ve igual dentro de cinco años.
#
# La paleta es la del sitio institucional (public/css/base.css) para que el
# informe se reconozca como parte de lo mismo.
#
# LO QUE ESTE INFORME HACE DISTINTO ──────────────────────────────────────
# Muestra lo que NO se pudo calcular con la misma prominencia que lo que sí.
# Los índices que la cámara no permite, la calibración de biomasa con R²
# pobre, la falta de franja de referencia: eso va arriba, no en una nota al
# pie. Es la diferencia entre un informe y un folleto.
# ═══════════════════════════════════════════════════════════════════════

import html
from datetime import datetime

from motor.dominio.recomendacion import ordenar
from motor.version import VERSION

_ESTILO = """
:root{color-scheme:dark;--obsidiana:#0B0C0A;--superficie:#1B1E19;
--superficie-alta:#232720;--oro:#E5C158;--oro-tenue:rgba(229,193,88,.14);
--verde-vivo:#4EA37A;--arcilla:#C4674A;--hueso:#F2F0E9;
--hueso-2:rgba(242,240,233,.72);--hueso-3:rgba(242,240,233,.50);
--linea:rgba(242,240,233,.11)}
*{box-sizing:border-box}
body{margin:0;background:var(--obsidiana);color:var(--hueso);
font:16px/1.6 "IBM Plex Sans",system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.hoja{max-width:60rem;margin:0 auto;padding:3rem 1.5rem 6rem}
h1{font-size:clamp(1.6rem,4vw,2.4rem);margin:0 0 .3rem;letter-spacing:-.01em}
h2{font-size:1.25rem;margin:3rem 0 1rem;padding-bottom:.5rem;
border-bottom:1px solid var(--linea)}
h3{font-size:1rem;margin:1.6rem 0 .5rem;color:var(--oro)}
.bajada{color:var(--hueso-3);margin:0 0 2rem;font-size:.95rem}
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.9rem}
th,td{text-align:left;padding:.55rem .6rem;border-bottom:1px solid var(--linea);
vertical-align:top}
th{color:var(--hueso-3);font-weight:600;font-size:.76rem;
text-transform:uppercase;letter-spacing:.09em}
td.num{text-align:right;font-variant-numeric:tabular-nums;
font-family:"IBM Plex Mono",ui-monospace,monospace}
.tarjetas{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));
margin:1.5rem 0}
.tarjeta{background:var(--superficie);border:1px solid var(--linea);
border-radius:.5rem;padding:1rem}
.tarjeta .dato{font-size:1.5rem;font-family:"IBM Plex Mono",ui-monospace,monospace;
color:var(--oro)}
.tarjeta .rotulo{font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;
color:var(--hueso-3);margin-top:.3rem}
.aviso{border-left:3px solid;padding:.9rem 1.1rem;margin:.9rem 0;
background:var(--superficie);border-radius:0 .4rem .4rem 0}
.aviso .nivel{font-size:.7rem;text-transform:uppercase;letter-spacing:.12em;
font-weight:600;margin-bottom:.4rem}
.aviso .fuente{font-size:.78rem;color:var(--hueso-3);margin-top:.6rem}
.revisar_a_campo{border-color:var(--arcilla)}
.revisar_a_campo .nivel{color:var(--arcilla)}
.advertencia{border-color:var(--oro)}
.advertencia .nivel{color:var(--oro)}
.sugerencia{border-color:var(--verde-vivo)}
.sugerencia .nivel{color:var(--verde-vivo)}
.informativo{border-color:var(--linea)}
.informativo .nivel{color:var(--hueso-3)}
.no-disponible{background:var(--superficie-alta);border-radius:.5rem;
padding:1rem 1.2rem;margin:1rem 0;font-size:.9rem}
.no-disponible code{color:var(--oro)}
.pie{margin-top:4rem;padding-top:1.2rem;border-top:1px solid var(--linea);
color:var(--hueso-3);font-size:.8rem}
@media print{body{background:#fff;color:#000}.hoja{max-width:none}
.tarjeta,.aviso,.no-disponible{background:#f4f4f2}}
"""


def _e(valor):
    """Escapa para HTML. Todo lo que viene de datos pasa por acá."""
    return html.escape(str(valor), quote=True)


def _numero(valor, decimales=2):
    if valor is None:
        return "—"
    return f"{valor:,.{decimales}f}".replace(",", " ").replace(".", ",")


def generar(contexto):
    """
    Arma el informe. `contexto` es un diccionario con lo que haya: todo es
    opcional salvo la identificación del vuelo, así que un vuelo del que
    solo se calcularon índices igual produce un informe válido.
    """
    partes = [
        "<!doctype html>",
        '<html lang="es"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        f"<title>Informe · {_e(contexto.get('lote', 'lote'))} · "
        f"{_e(contexto.get('fecha', ''))}</title>",
        f"<style>{_ESTILO}</style></head><body><main class=hoja>",
    ]

    partes.append(_encabezado(contexto))
    partes.append(_resumen(contexto))
    partes.append(_no_disponibles(contexto))
    partes.append(_indices(contexto))
    partes.append(_zonas(contexto))
    partes.append(_prescripcion(contexto))
    partes.append(_ganaderia(contexto))
    partes.append(_recomendaciones(contexto))
    partes.append(_pie(contexto))

    partes.append("</main></body></html>")
    return "\n".join(p for p in partes if p)


def _encabezado(c):
    return (
        f"<h1>{_e(c.get('lote', 'Lote'))}</h1>"
        f"<p class=bajada>{_e(c.get('campo', ''))} · vuelo del "
        f"{_e(c.get('fecha', ''))} · {_e(c.get('perfil_camara', ''))}</p>"
    )


def _resumen(c):
    tarjetas = []

    superficie = c.get("superficie_ha")
    if superficie:
        tarjetas.append((_numero(superficie, 1), "hectáreas"))

    if c.get("zonas"):
        tarjetas.append((str(len(c["zonas"])), "zonas de manejo"))

    if c.get("indices"):
        tarjetas.append((str(len(c["indices"])), "índices calculados"))

    resumen_prescripcion = c.get("resumen_prescripcion")
    if resumen_prescripcion:
        tarjetas.append((
            f"{_numero(resumen_prescripcion['insumo_total'], 0)}",
            f"{_e(resumen_prescripcion['unidad'].split('/')[0])} de "
            f"{_e(resumen_prescripcion.get('insumo', 'insumo'))} en total"))

    # La comparabilidad es un dato de primera plana, no una nota al pie.
    tarjetas.append((
        "Sí" if c.get("comparable") else "No",
        "comparable con otras fechas"))

    if not tarjetas:
        return ""

    celdas = "".join(
        f"<div class=tarjeta><div class=dato>{_e(dato)}</div>"
        f"<div class=rotulo>{rotulo}</div></div>"
        for dato, rotulo in tarjetas)

    aviso = ""
    if not c.get("comparable"):
        aviso = (
            "<div class='aviso advertencia'><div class=nivel>Advertencia</div>"
            "Este vuelo no declara calibración radiométrica, así que sus valores "
            "son números digitales y no reflectancia. Sirven para ver la "
            "variabilidad interna de este vuelo, pero <strong>no se pueden "
            "comparar con los de otra fecha</strong>: cambian con la nubosidad. "
            "Para seguimiento en el tiempo hace falta panel de reflectancia y "
            "sensor de luz descendente.</div>")

    return f"<div class=tarjetas>{celdas}</div>{aviso}"


def _no_disponibles(c):
    rechazados = c.get("indices_no_disponibles") or {}
    if not rechazados:
        return ""

    filas = "".join(
        f"<li><code>{_e(nombre)}</code> — {_e(motivo)}</li>"
        for nombre, motivo in sorted(rechazados.items()))

    return (
        "<h2>Lo que esta cámara no permite calcular</h2>"
        "<div class=no-disponible><p>Estos índices no se calcularon porque el "
        "sensor no tiene las bandas que sus fórmulas necesitan. "
        "<strong>No se reemplazó ninguna banda por otra parecida:</strong> eso "
        "produciría un número con el nombre del índice y sin su significado.</p>"
        f"<ul>{filas}</ul></div>")


def _indices(c):
    capas = c.get("indices") or {}
    if not capas:
        return ""

    filas = []
    for nombre, datos in sorted(capas.items()):
        filas.append(
            f"<tr><td>{_e(nombre)}</td>"
            f"<td class=num>{_numero(datos.get('media'), 3)}</td>"
            f"<td class=num>{_numero(datos.get('desvio'), 3)}</td>"
            f"<td class=num>{_numero(datos.get('minimo'), 3)}</td>"
            f"<td class=num>{_numero(datos.get('maximo'), 3)}</td>"
            f"<td style='font-size:.8rem;color:var(--hueso-3)'>"
            f"{_e(datos.get('fuente', ''))}</td></tr>")

    return (
        "<h2>Índices calculados</h2>"
        "<table><thead><tr><th>Índice</th><th>Media</th><th>Desvío</th>"
        "<th>Mínimo</th><th>Máximo</th><th>Fuente</th></tr></thead>"
        f"<tbody>{''.join(filas)}</tbody></table>")


def _zonas(c):
    zonas = c.get("zonas") or []
    if not zonas:
        return ""

    filas = "".join(
        f"<tr><td>Zona {_e(z['zona'])}</td>"
        f"<td class=num>{_numero(z['superficie_ha'], 2)}</td></tr>"
        for z in zonas)

    detalle = c.get("detalle_zonas") or {}
    nota = ""
    if detalle:
        nota = (
            f"<p class=bajada>k = {_e(detalle.get('k', '—'))}, calculadas a "
            f"{_e(detalle.get('resolucion_m', '—'))} m de resolución — la de la "
            f"maquinaria, no la del vuelo: ninguna fertilizadora varía la dosis "
            f"cada 5 cm. Superficie mínima por zona: "
            f"{_e(detalle.get('superficie_minima_ha', '—'))} ha.</p>")

    return (f"<h2>Zonas de manejo</h2>{nota}"
            "<table><thead><tr><th>Zona</th><th>Superficie (ha)</th></tr></thead>"
            f"<tbody>{filas}</tbody></table>")


def _prescripcion(c):
    prescripcion = c.get("prescripcion")
    if not prescripcion:
        return ""

    filas = "".join(
        f"<tr><td>Zona {_e(zona)}</td>"
        f"<td class=num>{_numero(datos.get('indice_suficiencia'), 2)}</td>"
        f"<td class=num>{_numero(datos.get('dosis_kg_ha'), 0)}</td>"
        f"<td style='font-size:.85rem'>{_e(datos.get('justificacion', ''))}</td></tr>"
        for zona, datos in sorted(prescripcion.items()))

    resumen = c.get("resumen_prescripcion") or {}
    pie = ""
    if resumen:
        pie = (f"<p class=bajada>Total: "
               f"{_numero(resumen.get('insumo_total'), 0)} "
               f"{_e(resumen.get('unidad', ''))} sobre "
               f"{_numero(resumen.get('superficie_total_ha'), 1)} ha "
               f"(dosis media ponderada "
               f"{_numero(resumen.get('dosis_media_ponderada'), 0)} "
               f"{_e(resumen.get('unidad', ''))}).</p>")

    return (
        "<h2>Prescripción</h2>"
        "<table><thead><tr><th>Zona</th><th>Índice de suficiencia</th>"
        "<th>Dosis</th><th>Por qué</th></tr></thead>"
        f"<tbody>{filas}</tbody></table>{pie}")


def _ganaderia(c):
    calibracion = c.get("calibracion_biomasa")
    if not calibracion:
        return ""

    aviso = ""
    if calibracion.get("ajuste_pobre"):
        aviso = (
            "<div class='aviso advertencia'><div class=nivel>Advertencia</div>"
            "El ajuste está por debajo del mínimo aceptable. Los kilos de este "
            "mapa muestran <strong>dónde hay más y dónde menos</strong>, pero no "
            "<strong>cuánto hay</strong>: no deberían usarse para decidir carga "
            "animal.</div>")

    filas = "".join(
        f"<tr><td>{_e(rotulo)}</td><td class=num>{_e(valor)}</td></tr>"
        for rotulo, valor in (
            ("Índice usado", calibracion.get("indice", "—")),
            ("R²", _numero(calibracion.get("r2"), 3)),
            ("Error típico (kg MS/ha)", _numero(calibracion.get("rmse_kg_ms_ha"), 0)),
            ("Puntos de calibración", calibracion.get("n_muestras", "—")),
            ("Origen de los puntos", calibracion.get("origen", "—")),
        ))

    return (f"<h2>Calibración de biomasa</h2>{aviso}"
            f"<table><tbody>{filas}</tbody></table>")


def _recomendaciones(c):
    recomendaciones = c.get("recomendaciones") or []
    if not recomendaciones:
        return ""

    bloques = []
    for r in ordenar(recomendaciones):
        bloques.append(
            f"<div class='aviso {_e(r.nivel)}'>"
            f"<div class=nivel>{_e(r.nivel.replace('_', ' '))}</div>"
            f"{_e(r.texto)}"
            + (f"<div class=fuente>Umbral aplicado: {_e(r.umbral_aplicado)}</div>"
               if r.umbral_aplicado else "")
            + f"<div class=fuente>Fuente: {_e(r.fuente)}</div></div>")

    return f"<h2>Recomendaciones</h2>{''.join(bloques)}"


def _pie(c):
    return (
        "<div class=pie>"
        f"Generado por el motor v{_e(VERSION)} el "
        f"{_e(datetime.now().strftime('%d/%m/%Y %H:%M'))}. "
        "Cada número de este informe lleva su fuente y sus supuestos. "
        "Un modelo sin supuestos declarados es una opinión con decimales."
        "</div>")


def escribir(contexto, ruta):
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(generar(contexto))
    return ruta
