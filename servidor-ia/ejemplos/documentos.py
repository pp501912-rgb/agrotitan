#!/usr/bin/env python3
"""
Preguntar sobre documentos propios, sin que salgan de la máquina.

Indexa los archivos de texto de una carpeta, busca los fragmentos más
parecidos a la pregunta y se los pasa al modelo como contexto. Es el
esquema clásico de RAG, en su versión mínima: sin base vectorial, sin
dependencias, todo con la biblioteca estándar de Python.

    # indexar una carpeta con informes, normativa, planillas exportadas...
    python3 ejemplos/documentos.py indexar ~/agrotitan/informes

    # preguntar
    python3 ejemplos/documentos.py preguntar "¿Qué rinde asumimos para nogal?"

Formatos: .txt, .md, .csv. Para PDFs, convertilos antes con
`pdftotext archivo.pdf archivo.txt`.

El índice queda en servidor-ia/.indice.json y no se versiona.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import NoReturn

RAIZ = Path(__file__).resolve().parent.parent
INDICE = RAIZ / ".indice.json"
EXTENSIONES = {".txt", ".md", ".csv"}

# Un fragmento por consulta al modelo: chico como para ser específico,
# grande como para no cortar una idea al medio.
TAMANO_FRAGMENTO = 1200
SOLAPE = 200
FRAGMENTOS_POR_RESPUESTA = 5


def cfg(clave: str, default: str) -> str:
    env = RAIZ / ".env"
    if env.is_file():
        for linea in env.read_text(encoding="utf-8").splitlines():
            if linea.startswith(f"{clave}="):
                return linea.split("=", 1)[1].strip()
    return default


API = f"http://localhost:{cfg('PUERTO_API', '11434')}/v1"
MODELO = cfg("MODELO", "qwen2.5:7b-instruct")
MODELO_EMB = cfg("MODELO_EMBEDDINGS", "nomic-embed-text")


def pedir(ruta: str, cuerpo: dict, timeout: int = 300) -> dict:
    """POST al servidor local. Devuelve el JSON de respuesta."""
    pedido = urllib.request.Request(
        f"{API}/{ruta}",
        data=json.dumps(cuerpo).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer local"},
    )
    try:
        with urllib.request.urlopen(pedido, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.URLError as e:
        salir(
            f"No pude hablar con el servidor en {API}\n"
            f"  ({e.reason})\n"
            f"  Levantalo con:  make arriba"
        )


def salir(mensaje: str) -> NoReturn:
    print(mensaje, file=sys.stderr)
    raise SystemExit(1)


def embeddings(textos: list[str]) -> list[list[float]]:
    """Convierte textos en vectores. El servidor acepta varios de una."""
    r = pedir("embeddings", {"model": MODELO_EMB, "input": textos})
    return [d["embedding"] for d in sorted(r["data"], key=lambda d: d["index"])]


def similitud(a: list[float], b: list[float]) -> float:
    """Coseno entre dos vectores."""
    punto = sum(x * y for x, y in zip(a, b))
    norma = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return punto / norma if norma else 0.0


def fragmentar(texto: str) -> list[str]:
    """Corta en trozos con solape, para no partir una idea entre dos."""
    trozos, i = [], 0
    while i < len(texto):
        trozo = texto[i : i + TAMANO_FRAGMENTO].strip()
        if trozo:
            trozos.append(trozo)
        i += TAMANO_FRAGMENTO - SOLAPE
    return trozos


def indexar(carpeta: Path) -> None:
    if not carpeta.is_dir():
        salir(f"No existe la carpeta: {carpeta}")

    archivos = sorted(p for p in carpeta.rglob("*") if p.suffix.lower() in EXTENSIONES)
    if not archivos:
        salir(
            f"No encontré archivos {'/'.join(sorted(EXTENSIONES))} en {carpeta}\n"
            f"  Para PDFs:  pdftotext archivo.pdf archivo.txt"
        )

    print(f"Indexando {len(archivos)} archivo(s) de {carpeta}\n")
    entradas = []
    for archivo in archivos:
        texto = archivo.read_text(encoding="utf-8", errors="replace")
        trozos = fragmentar(texto)
        if not trozos:
            continue
        print(f"  {archivo.relative_to(carpeta)} · {len(trozos)} fragmento(s)")
        # De a tandas, para no mandar un pedido gigante.
        for i in range(0, len(trozos), 32):
            tanda = trozos[i : i + 32]
            for trozo, vector in zip(tanda, embeddings(tanda)):
                entradas.append(
                    {"archivo": str(archivo), "texto": trozo, "vector": vector}
                )

    INDICE.write_text(
        json.dumps({"modelo": MODELO_EMB, "entradas": entradas}, ensure_ascii=False),
        encoding="utf-8",
    )
    tam = INDICE.stat().st_size / 1024 / 1024
    print(f"\nListo: {len(entradas)} fragmentos en {INDICE.name} ({tam:.1f} MB)")
    print(f'Probá:  python3 ejemplos/documentos.py preguntar "tu pregunta"')


def preguntar(pregunta: str) -> None:
    if not INDICE.is_file():
        salir(
            "Todavía no hay índice.\n"
            "  Crealo con:  python3 ejemplos/documentos.py indexar <carpeta>"
        )

    datos = json.loads(INDICE.read_text(encoding="utf-8"))
    if datos.get("modelo") != MODELO_EMB:
        salir(
            f"El índice se armó con '{datos.get('modelo')}' y ahora el .env dice\n"
            f"  '{MODELO_EMB}'. Los vectores no son comparables entre modelos:\n"
            f"  volvé a indexar la carpeta."
        )

    vector_pregunta = embeddings([pregunta])[0]
    relevantes = sorted(
        datos["entradas"],
        key=lambda e: similitud(vector_pregunta, e["vector"]),
        reverse=True,
    )[:FRAGMENTOS_POR_RESPUESTA]

    contexto = "\n\n---\n\n".join(
        f"[{Path(e['archivo']).name}]\n{e['texto']}" for e in relevantes
    )

    r = pedir(
        "chat/completions",
        {
            "model": MODELO,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Respondés preguntas usando SOLO los fragmentos de documentos "
                        "que te paso. Si la respuesta no está ahí, decilo con todas "
                        "las letras en vez de inventarla. Citá entre corchetes el "
                        "archivo del que sacaste cada dato. Español rioplatense."
                    ),
                },
                {"role": "user", "content": f"Documentos:\n\n{contexto}\n\nPregunta: {pregunta}"},
            ],
            "temperature": 0.1,
        },
    )

    print(r["choices"][0]["message"]["content"])
    print("\n--- fragmentos consultados ---")
    for e in relevantes:
        print(f"  {Path(e['archivo']).name}")


def main() -> None:
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "indexar":
        indexar(Path(args[1]).expanduser())
    elif len(args) >= 2 and args[0] == "preguntar":
        preguntar(" ".join(args[1:]))
    else:
        print(__doc__)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
