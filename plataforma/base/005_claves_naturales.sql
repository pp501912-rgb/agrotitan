-- ═══════════════════════════════════════════════════════════════════════
-- PLATAFORMA MULTIESPECTRAL · CLAVES NATURALES
--
-- El manifiesto de cada vuelo guarda NOMBRES —organización, campo, lote—,
-- no identificadores de la base. Es a propósito: un uuid huérfano no
-- reconstruye nada, y el manifiesto existe justamente para poder repoblar
-- la base cuando se pierde.
--
-- Pero para que un nombre sirva de llave, tiene que ser único. Sin estas
-- restricciones, reconstruir crearía un campo "La Esperanza" nuevo en cada
-- corrida en vez de reconocer el que ya está.
--
-- nucleo.lote ya tenía UNIQUE (campo_id, nombre) desde 001.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE nucleo.organizacion
    ADD CONSTRAINT organizacion_nombre_unico UNIQUE (nombre);

ALTER TABLE nucleo.campo
    ADD CONSTRAINT campo_nombre_unico UNIQUE (organizacion_id, nombre);

-- Un vuelo queda identificado por lote + fecha + hash del ortomosaico de
-- entrada. Reprocesar el mismo archivo no debe duplicar el vuelo; volar el
-- mismo lote dos veces el mismo día sí son dos vuelos, y el hash los separa.
ALTER TABLE vuelo.ortomosaico
    ADD CONSTRAINT ortomosaico_sha_unico UNIQUE (organizacion_id, sha256);

COMMENT ON CONSTRAINT ortomosaico_sha_unico ON vuelo.ortomosaico IS
    'Reprocesar el mismo archivo no duplica el vuelo. Es lo que hace que '
    'reconstruir desde los manifiestos sea idempotente.';
