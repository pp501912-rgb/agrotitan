#!/usr/bin/env python3
"""
Verifica que contenido.yaml y el sitio publicado digan lo mismo.

Tener una fuente de verdad no sirve de nada si nadie comprueba que
sigue siendo verdad. Este script compara los textos de contenido.yaml
contra public/index.html y avisa cuáles ya no aparecen.

    python3 herramientas/verificar-contenido.py

Sale con código 1 si encuentra diferencias, así que sirve tanto a mano
como dentro de un hook o de un paso de CI.

Qué NO hace: no valida al revés. Que un texto del sitio no esté en el
YAML no se detecta acá, porque el HTML tiene mucho texto estructural
que no corresponde volcar al YAML.
"""

from __future__ import annotations

import html
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
YAML = RAIZ / "contenido.yaml"
PAGINA = RAIZ / "public" / "index.html"

# Claves cuyo valor no es texto visible de la página, así que
# compararlas contra el HTML no tendría sentido.
IGNORAR = {
    "url", "paginas", "idioma", "whatsapp_internacional", "email",
    "numero", "titulo", "descripcion", "diferencial", "entrega",
    "confidencialidad", "sin_nombres_propios", "sin_rastreo",
}


def texto_visible(ruta: Path) -> str:
    """El HTML sin etiquetas, sin scripts y con los espacios normalizados."""
    bruto = ruta.read_text(encoding="utf-8")
    bruto = re.sub(r"<(script|style|svg)\b.*?</\1>", " ", bruto, flags=re.S | re.I)
    bruto = re.sub(r"<!--.*?-->", " ", bruto, flags=re.S)
    bruto = re.sub(r"<[^>]+>", " ", bruto)
    return normalizar(html.unescape(bruto))


def normalizar(t: str) -> str:
    """Minúsculas, sin tildes y con un solo espacio entre palabras.

    Así una diferencia de acento, de mayúscula o de salto de línea en el
    HTML no se reporta como si el texto hubiera cambiado.
    """
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s ]+", " ", t).strip()


def recorrer(nodo, ruta=""):
    """Devuelve (ruta, texto) por cada cadena del YAML."""
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            if k in IGNORAR and not isinstance(v, (dict, list)):
                continue
            yield from recorrer(v, f"{ruta}.{k}" if ruta else k)
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo):
            yield from recorrer(v, f"{ruta}[{i}]")
    elif isinstance(nodo, str) and len(nodo.strip()) >= 4:
        # El umbral es bajo a propósito: las cifras de portada («10 años»,
        # «130 ha») son cortas y son justamente el dato que más importa
        # que no quede desactualizado.
        yield ruta, nodo


def main() -> int:
    try:
        import yaml
    except ImportError:
        print("Falta PyYAML.  pip install pyyaml", file=sys.stderr)
        return 2

    for archivo in (YAML, PAGINA):
        if not archivo.is_file():
            print(f"No encuentro {archivo.relative_to(RAIZ)}", file=sys.stderr)
            return 2

    pagina = texto_visible(PAGINA)
    datos = yaml.safe_load(YAML.read_text(encoding="utf-8"))

    revisados = faltantes = 0
    for ruta, valor in recorrer(datos):
        if ruta.split(".")[-1].split("[")[0] in IGNORAR:
            continue
        revisados += 1
        if normalizar(valor) not in pagina:
            faltantes += 1
            print(f"\n  ✗ {ruta}")
            print(f"    {valor.strip()[:100]}...")

    print()
    if faltantes:
        print(f"  {faltantes} de {revisados} textos del YAML ya no están en la página.")
        print("  Alguno de los dos quedó viejo: sincronizalos antes de publicar.")
        return 1

    print(f"  ✓ los {revisados} textos de contenido.yaml están en la página")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
