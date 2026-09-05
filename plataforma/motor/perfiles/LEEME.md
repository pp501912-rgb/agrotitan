# Perfiles de cámara

Un archivo YAML por cámara. **Agregar una cámara nueva es agregar un archivo acá, sin tocar
código** — incluidas las que salgan dentro de cinco años.

## Qué significa cada campo

- `orden` — número de banda **dentro del ortomosaico**, empezando en 1. Ojo: no es un dato de la
  cámara sino del software que armó el ortomosaico. Si tu flujo produce otro orden, se sobreescribe
  al ingerir con `--orden`. Los valores acá son los del flujo estándar (ODM / DJI Terra).
- `rol` — vocabulario `common_name` de la extensión EO de STAC. **Es lo único que mira el motor.**
- `lambda_nm` — longitud de onda central.
- `fwhm_nm` — ancho de banda a media altura.

## Advertencia

Las longitudes de onda son las publicadas por cada fabricante y se usan solo como referencia
documental: el motor identifica bandas por `rol`, no por longitud de onda. Aun así, **verificá
contra la hoja de datos de tu equipo** antes de publicar un informe que las cite.
