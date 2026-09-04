-- ═══════════════════════════════════════════════════════════════════════
-- PLATAFORMA MULTIESPECTRAL · AISLAMIENTO POR ORGANIZACIÓN (RLS)
--
-- Hoy hay un solo cliente. Se activa igual, desde el día uno, porque el día
-- que haya cien no se cambia una sola consulta del motor: la base ya filtra.
-- Agregar esto después es reauditar la aplicación entera.
--
-- Cómo se usa desde el motor, una vez por conexión:
--     SET app.organizacion = '<uuid de la organización>';
--
-- Si nadie lo setea, current_setting(..., true) devuelve NULL y las políticas
-- no dejan ver nada. Fallar cerrado es lo correcto acá: preferimos una
-- consulta vacía antes que mostrarle a un cliente los lotes de otro.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nucleo.organizacion_actual()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(current_setting('app.organizacion', true), '')::uuid;
$$;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'nucleo.usuario', 'nucleo.campo', 'nucleo.lote', 'nucleo.campana',
        'sensor.camara', 'sensor.calibracion',
        'vuelo.vuelo', 'vuelo.ortomosaico', 'vuelo.control_calidad',
        'indice.capa',
        'manejo.zona', 'manejo.prescripcion', 'manejo.recomendacion',
        'campo.muestra_suelo', 'campo.corte_biomasa', 'campo.lectura_plato',
        'campo.franja_referencia_n',
        'ganaderia.potrero', 'ganaderia.calibracion_biomasa',
        'ganaderia.disponibilidad', 'ganaderia.evento_pastoreo',
        'auditoria.corrida'
    ] LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY aislamiento_organizacion ON %s
                 USING      (organizacion_id = nucleo.organizacion_actual())
                 WITH CHECK (organizacion_id = nucleo.organizacion_actual())', t);
    END LOOP;
END;
$$;

-- La organización en sí: cada quien ve solamente la suya.
ALTER TABLE nucleo.organizacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON nucleo.organizacion
    USING (id = nucleo.organizacion_actual());

-- Los perfiles de cámara y sus bandas son catálogo compartido, no dato de
-- cliente: no llevan organizacion_id ni RLS. Que dos clientes usen el mismo
-- Mavic 3M no es información de nadie.
