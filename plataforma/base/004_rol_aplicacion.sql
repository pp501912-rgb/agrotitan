-- ═══════════════════════════════════════════════════════════════════════
-- PLATAFORMA MULTIESPECTRAL · ROL DE APLICACIÓN
--
-- ⚠ ESTE ARCHIVO ARREGLA UN AGUJERO REAL.
--
-- Row Level Security NO SE APLICA A UN SUPERUSUARIO. Las 23 políticas de
-- aislamiento de 003_rls.sql existen y están bien escritas, pero si el
-- motor se conecta con un superusuario —y el usuario que crea la base lo
-- es— no filtran absolutamente nada: un cliente vería los lotes de otro.
--
-- Comprobar que las políticas EXISTEN no es lo mismo que comprobar que se
-- APLICAN. Este archivo hace dos cosas para cerrarlo:
--
--   1. FORCE ROW LEVEL SECURITY, para que las políticas alcancen también
--      al dueño de las tablas. Sin esto, el dueño las saltea igual que un
--      superusuario.
--   2. Un rol de aplicación sin privilegios especiales, que es con el que
--      el motor tiene que conectarse. Nunca con el dueño ni con postgres.
--
-- Contra un superusuario no hay defensa posible del lado de la base: la
-- única defensa es no usarlo. motor/base/conexion.py avisa si detecta que
-- está conectado como superusuario, en vez de dejarlo pasar en silencio.
--
-- Se corre DESPUÉS de 003_rls.sql.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Que las políticas alcancen también al dueño ─────────────────────
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'nucleo.organizacion', 'nucleo.usuario', 'nucleo.campo', 'nucleo.lote',
        'nucleo.campana',
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
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    END LOOP;
END;
$$;


-- ── 2. El rol con el que se conecta el motor ───────────────────────────
-- Sin SUPERUSER y sin BYPASSRLS, explícitamente. La contraseña se cambia
-- en la instalación: la de acá es para desarrollo y está a la vista.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plataforma_app') THEN
        CREATE ROLE plataforma_app
            LOGIN
            NOSUPERUSER
            NOBYPASSRLS
            NOCREATEDB
            NOCREATEROLE
            PASSWORD 'cambiar_en_produccion';
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA nucleo, sensor, vuelo, indice, manejo, campo,
                      ganaderia, auditoria
    TO plataforma_app;

-- El motor lee, inserta y actualiza. NO borra: un vuelo se marca
-- 'rechazado', no se borra. Que el rol no tenga DELETE es una barandilla,
-- no una molestia.
DO $$
DECLARE
    e text;
BEGIN
    FOREACH e IN ARRAY ARRAY['nucleo', 'sensor', 'vuelo', 'indice', 'manejo',
                             'campo', 'ganaderia', 'auditoria'] LOOP
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA %I TO plataforma_app', e);
        EXECUTE format(
            'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO plataforma_app', e);
        -- Para las tablas que se creen después (particiones de años nuevos).
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES IN SCHEMA %I '
            'GRANT SELECT, INSERT, UPDATE ON TABLES TO plataforma_app', e);
    END LOOP;
END;
$$;


-- ── 3. Comprobación ────────────────────────────────────────────────────
-- Si esta vista devuelve filas, hay algo que puede saltear el aislamiento.
CREATE OR REPLACE VIEW auditoria.roles_que_saltean_rls AS
SELECT rolname,
       rolsuper    AS es_superusuario,
       rolbypassrls AS puede_saltear_rls
  FROM pg_roles
 WHERE (rolsuper OR rolbypassrls)
   AND rolcanlogin
   AND rolname NOT IN ('postgres');

COMMENT ON VIEW auditoria.roles_que_saltean_rls IS
    'Roles con login que saltean las políticas de aislamiento. El motor '
    'nunca debería conectarse con uno de estos: usar plataforma_app.';
