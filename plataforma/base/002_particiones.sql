-- ═══════════════════════════════════════════════════════════════════════
-- PLATAFORMA MULTIESPECTRAL · PARTICIONES
--
-- Cuatro tablas crecen sin techo porque hay una fila por vuelo, por capa y
-- por corrida: se particionan por año. Una campaña vieja se desprende con
-- DETACH PARTITION y se archiva sin tocar el resto de la base.
--
-- Una partición que falta NO es un error silencioso: sin la partición DEFAULT
-- el INSERT falla. La dejamos puesta para que nunca se pierda un dato, y la
-- consulta de control de abajo avisa si algo cayó ahí.
-- ═══════════════════════════════════════════════════════════════════════

-- Crea las particiones de un año para las cuatro tablas particionadas.
-- Se llama una vez por año, en diciembre, o desde el arranque del motor.
CREATE OR REPLACE FUNCTION auditoria.crear_particiones_anio(anio integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    desde date := make_date(anio, 1, 1);
    hasta date := make_date(anio + 1, 1, 1);
    t     text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'vuelo.vuelo',
        'indice.capa',
        'ganaderia.disponibilidad',
        'auditoria.corrida'
    ] LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %s_%s PARTITION OF %s
                 FOR VALUES FROM (%L) TO (%L)',
            replace(t, '.', '.p_'), anio, t, desde, hasta
        );
    END LOOP;
END;
$$;

-- Particiones por defecto: red de contención, no lugar de trabajo.
CREATE TABLE vuelo.p_vuelo_default
    PARTITION OF vuelo.vuelo DEFAULT;
CREATE TABLE indice.p_capa_default
    PARTITION OF indice.capa DEFAULT;
CREATE TABLE ganaderia.p_disponibilidad_default
    PARTITION OF ganaderia.disponibilidad DEFAULT;
CREATE TABLE auditoria.p_corrida_default
    PARTITION OF auditoria.corrida DEFAULT;

-- Años en uso. Agregar el siguiente antes de que empiece.
SELECT auditoria.crear_particiones_anio(2025);
SELECT auditoria.crear_particiones_anio(2026);
SELECT auditoria.crear_particiones_anio(2027);

-- ── Control ────────────────────────────────────────────────────────────
-- Si esta consulta devuelve algo, falta crear una partición: hay datos
-- viviendo en el DEFAULT, donde el particionado no ayuda en nada.
CREATE OR REPLACE VIEW auditoria.particiones_default_ocupadas AS
SELECT 'vuelo.vuelo'              AS tabla, count(*) AS filas FROM vuelo.p_vuelo_default
UNION ALL
SELECT 'indice.capa',              count(*) FROM indice.p_capa_default
UNION ALL
SELECT 'ganaderia.disponibilidad', count(*) FROM ganaderia.p_disponibilidad_default
UNION ALL
SELECT 'auditoria.corrida',        count(*) FROM auditoria.p_corrida_default;
