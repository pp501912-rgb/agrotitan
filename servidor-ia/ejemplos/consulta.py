#!/usr/bin/env python3
"""
Mismo ejemplo, en Python, con el SDK de OpenAI apuntado al servidor local.

    pip install openai
    python3 ejemplos/consulta.py "¿Qué margen bruto deja una hectárea de nogal?"

El servidor local no valida la api_key: hay que mandar algo porque el
protocolo lo exige, nada más.
"""

import os
import sys
from pathlib import Path

from openai import OpenAI

RAIZ = Path(__file__).resolve().parent.parent


def cfg(clave: str, default: str) -> str:
    """Lee una variable del .env, con el entorno teniendo prioridad."""
    if valor := os.environ.get(clave):
        return valor
    env = RAIZ / ".env"
    if env.is_file():
        for linea in env.read_text(encoding="utf-8").splitlines():
            if linea.startswith(f"{clave}="):
                return linea.split("=", 1)[1].strip()
    return default


cliente = OpenAI(
    base_url=f"http://localhost:{cfg('PUERTO_API', '11434')}/v1",
    api_key="local",
)

pregunta = " ".join(sys.argv[1:]) or "Contame en una línea qué sabés hacer."

respuesta = cliente.chat.completions.create(
    model=cfg("MODELO", "qwen2.5:7b-instruct"),
    messages=[
        {"role": "system", "content": "Respondé en español rioplatense, claro y sin rodeos."},
        {"role": "user", "content": pregunta},
    ],
    temperature=0.3,
    stream=True,
)

for trozo in respuesta:
    if texto := trozo.choices[0].delta.content:
        print(texto, end="", flush=True)
print()
