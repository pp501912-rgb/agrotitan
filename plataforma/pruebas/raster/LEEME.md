# Pruebas de la capa ráster

**Estas pruebas no corrieron nunca todavía.** Se escribieron en un entorno sin acceso a PyPI,
donde no se pudo instalar numpy ni rasterio (ver `../../LEEME.md`).

Corren en la PC de destino, después de armar el entorno:

```bash
conda env create -f entorno.yml
conda activate plataforma
python3 datos/generar_sintetico.py datos/ejemplo/orto.tif
python3 -m unittest discover -s pruebas -t . -v
```

`unittest` las saltea con un mensaje claro si falta numpy o rasterio, así que la suite del
dominio sigue corriendo en cualquier máquina.
