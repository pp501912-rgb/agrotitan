# ═══════════════════════════════════════════════════════════════════════
# DOMINIO · EVALUADOR DE FÓRMULAS ESPECTRALES
#
# Los índices se declaran como texto en catalogo/indices.json:
#
#     "NDRE": "(nir - rededge) / (nir + rededge)"
#
# Ese archivo se edita para agregar un índice nuevo, así que evaluarlo con
# eval() sería dejar una puerta abierta: cualquiera que edite el catálogo
# ejecutaría código en la máquina. Se parsea con ast y se recorre el árbol
# permitiendo SOLO aritmética.
#
# EL PUNTO IMPORTANTE DEL DISEÑO ─────────────────────────────────────────
# El evaluador no sabe si 'nir' es un número o un array de numpy: solo usa
# operadores, y numpy los tiene sobrecargados. Entonces el mismo código que
# se prueba acá con floats es EXACTAMENTE el que corre sobre millones de
# píxeles en raster/indices.py. Una prueba con dos decimales verifica el
# camino de producción completo.
# ═══════════════════════════════════════════════════════════════════════

import ast

from motor.dominio.errores import FormulaInvalida

# Solo aritmética. Sin llamadas a función, sin atributos, sin índices, sin
# comparaciones: nada que permita alcanzar el intérprete.
_NODOS_PERMITIDOS = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.Name,
    ast.Load,
    ast.Constant,
)

_OPERADORES_PERMITIDOS = (
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Pow,
    ast.USub,
    ast.UAdd,
)


def nombres(formula):
    """
    Devuelve el conjunto de nombres que la fórmula necesita.

    Sirve para dos cosas antes de calcular nada: saber qué roles de banda
    hace falta tener, y detectar una fórmula que pide algo que no existe.
    """
    try:
        arbol = ast.parse(formula, mode="eval")
    except SyntaxError as e:
        raise FormulaInvalida(f"No se pudo leer la fórmula «{formula}»: {e}") from e

    return {n.id for n in ast.walk(arbol) if isinstance(n, ast.Name)}


def evaluar(formula, contexto):
    """
    Evalúa la fórmula con los valores de `contexto`.

    `contexto` mapea nombre → valor. Los valores pueden ser números (para
    probar y para estadísticas zonales) o arrays de numpy (para el ráster):
    al evaluador le da igual, porque solo aplica operadores.
    """
    try:
        arbol = ast.parse(formula, mode="eval")
    except SyntaxError as e:
        raise FormulaInvalida(f"No se pudo leer la fórmula «{formula}»: {e}") from e

    return _evaluar_nodo(arbol.body, contexto, formula)


def _evaluar_nodo(nodo, contexto, formula):
    if not isinstance(nodo, _NODOS_PERMITIDOS):
        raise FormulaInvalida(
            f"La fórmula «{formula}» usa {type(nodo).__name__}, que no está permitido. "
            f"Solo se admite aritmética sobre roles de banda y números."
        )

    if isinstance(nodo, ast.Constant):
        if not isinstance(nodo.value, (int, float)):
            raise FormulaInvalida(
                f"La fórmula «{formula}» tiene una constante que no es un número: "
                f"{nodo.value!r}"
            )
        return nodo.value

    if isinstance(nodo, ast.Name):
        if nodo.id not in contexto:
            raise FormulaInvalida(
                f"La fórmula «{formula}» necesita «{nodo.id}», que no está disponible. "
                f"Disponibles: {sorted(contexto)}"
            )
        return contexto[nodo.id]

    if isinstance(nodo, ast.UnaryOp):
        if not isinstance(nodo.op, _OPERADORES_PERMITIDOS):
            raise FormulaInvalida(
                f"La fórmula «{formula}» usa el operador {type(nodo.op).__name__}, "
                f"que no está permitido."
            )
        valor = _evaluar_nodo(nodo.operand, contexto, formula)
        return -valor if isinstance(nodo.op, ast.USub) else +valor

    # BinOp
    if not isinstance(nodo.op, _OPERADORES_PERMITIDOS):
        raise FormulaInvalida(
            f"La fórmula «{formula}» usa el operador {type(nodo.op).__name__}, "
            f"que no está permitido."
        )

    izq = _evaluar_nodo(nodo.left, contexto, formula)
    der = _evaluar_nodo(nodo.right, contexto, formula)

    if isinstance(nodo.op, ast.Add):
        return izq + der
    if isinstance(nodo.op, ast.Sub):
        return izq - der
    if isinstance(nodo.op, ast.Mult):
        return izq * der
    if isinstance(nodo.op, ast.Div):
        return izq / der
    return izq ** der
