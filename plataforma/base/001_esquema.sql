-- ═══════════════════════════════════════════════════════════════════════
-- PLATAFORMA MULTIESPECTRAL · ESQUEMA DE DATOS
--
-- PostgreSQL 16 + PostGIS 3.4. Es el contrato de datos del proyecto:
-- si algo no está acá, no existe.
--
-- Principio rector: EL PÍXEL NUNCA ENTRA A LA BASE.
-- PostGIS guarda geometrías, metadatos, estadísticas y trazabilidad.
-- Los rásters viven en disco como COG y la base guarda un puntero
-- (ruta + footprint). Con 2 TB de rásters, esta base pesa megabytes.
--
-- Tres reglas del negocio están codificadas como restricciones, no como
-- documentación, porque la documentación no frena un INSERT:
--   1. vuelo.chk_comparable    → sin calibración radiométrica, un vuelo
--                                no puede declararse comparable
--   2. manejo.recomendacion.fuente NOT NULL → sin fuente no hay consejo
--   3. nucleo.lote.superficie_ha se calcula por trigger en UTM, jamás
--                                en grados
--
-- Orden de ejecución: 001 (este) → 002_particiones.sql → 003_rls.sql
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

CREATE SCHEMA IF NOT EXISTS nucleo;
CREATE SCHEMA IF NOT EXISTS sensor;
CREATE SCHEMA IF NOT EXISTS vuelo;
CREATE SCHEMA IF NOT EXISTS indice;
CREATE SCHEMA IF NOT EXISTS manejo;
CREATE SCHEMA IF NOT EXISTS campo;
CREATE SCHEMA IF NOT EXISTS ganaderia;
CREATE SCHEMA IF NOT EXISTS auditoria;


-- ═══════════════════════════════════════════════════════════════════════
-- NÚCLEO · quién es dueño de qué, y dónde queda
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE nucleo.organizacion (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          text NOT NULL,
    identificacion  text,                    -- CUIT / RUT / RUC según el país
    pais            char(2) NOT NULL,        -- ISO 3166-1: AR, CL, UY, PY
    creada          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nucleo.usuario (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    email           text NOT NULL UNIQUE,
    nombre          text NOT NULL,
    rol             text NOT NULL DEFAULT 'tecnico'
                    CHECK (rol IN ('admin', 'agronomo', 'tecnico', 'lectura')),
    creado          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nucleo.campo (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    nombre          text NOT NULL,
    provincia       text,
    pais            char(2) NOT NULL,
    geom            geometry(MultiPolygon, 4326),

    -- La zona UTM del campo. Todo cálculo de superficie y distancia se hace
    -- reproyectando a este EPSG. En el Cono Sur: 32721 (21S), 32720 (20S),
    -- 32719 (19S). Se fija una vez, al dar de alta el campo, y no se toca.
    epsg_utm        integer NOT NULL,

    creado          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nucleo.lote (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    campo_id        uuid NOT NULL REFERENCES nucleo.campo(id) ON DELETE CASCADE,
    nombre          text NOT NULL,
    geom            geometry(MultiPolygon, 4326) NOT NULL,

    -- La calcula un trigger reproyectando a la UTM del campo. Nunca se
    -- escribe a mano: una hectárea medida en grados no es una hectárea.
    superficie_ha   numeric(12,4),

    creado          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campo_id, nombre)
);

CREATE TABLE nucleo.campana (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    nombre          text NOT NULL,           -- '2026/27'
    desde           date NOT NULL,
    hasta           date NOT NULL,
    CHECK (hasta > desde)
);


-- Superficie en UTM, no en grados. ────────────────────────────────────
CREATE OR REPLACE FUNCTION nucleo.calcular_superficie_lote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    epsg integer;
BEGIN
    SELECT c.epsg_utm INTO epsg FROM nucleo.campo c WHERE c.id = NEW.campo_id;
    NEW.superficie_ha := ST_Area(ST_Transform(NEW.geom, epsg)) / 10000.0;
    RETURN NEW;
END;
$$;

CREATE TRIGGER lote_superficie
    BEFORE INSERT OR UPDATE OF geom ON nucleo.lote
    FOR EACH ROW EXECUTE FUNCTION nucleo.calcular_superficie_lote();


-- ═══════════════════════════════════════════════════════════════════════
-- SENSOR · el agnosticismo de cámara vive acá
--
-- Una cámara nueva se agrega insertando filas, no cambiando código. El
-- perfil YAML de motor/perfiles/ es el espejo en archivo de estas tablas.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE sensor.perfil_camara (
    id              text PRIMARY KEY,        -- 'mavic3m', 'rededge-p', 'generico-5bandas'
    marca           text NOT NULL,
    modelo          text NOT NULL,
    tiene_dls       boolean NOT NULL DEFAULT false,
    tiene_panel     boolean NOT NULL DEFAULT false,
    notas           text
);

CREATE TABLE sensor.banda_perfil (
    perfil_id       text NOT NULL REFERENCES sensor.perfil_camara(id) ON DELETE CASCADE,
    orden           smallint NOT NULL,       -- número de banda en el GeoTIFF, 1-based

    -- El rol es lo único que el motor mira. Vocabulario: common_name de la
    -- extensión EO de STAC. Un índice se declara sobre roles, así que una
    -- cámara que no exista todavía funciona el día que alguien cargue su rol.
    rol             text NOT NULL CHECK (rol IN
                    ('coastal','blue','green','yellow','red','rededge',
                     'nir','nir08','nir09','pan','lwir')),

    lambda_nm       numeric(6,1) NOT NULL,   -- longitud de onda central
    fwhm_nm         numeric(6,1),            -- ancho de banda a media altura
    PRIMARY KEY (perfil_id, orden),
    UNIQUE (perfil_id, rol)
);

CREATE TABLE sensor.camara (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    perfil_id       text NOT NULL REFERENCES sensor.perfil_camara(id),
    numero_serie    text,
    alta            date NOT NULL DEFAULT current_date
);

CREATE TABLE sensor.calibracion (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    camara_id       uuid NOT NULL REFERENCES sensor.camara(id) ON DELETE CASCADE,
    fecha           date NOT NULL,

    -- 'panel' es lo mínimo aceptable; 'panel+dls' es lo recomendado.
    -- 'ninguna' existe para poder registrar el vuelo, no para compararlo.
    metodo          text NOT NULL CHECK (metodo IN ('ninguna','panel','dls','panel+dls')),

    panel_serie     text,
    coeficientes    jsonb,                   -- reflectancia por banda del panel
    notas           text
);


-- ═══════════════════════════════════════════════════════════════════════
-- VUELO · el hecho central. Particionado por año.
--
-- Las tablas particionadas exigen que la PK incluya la clave de partición,
-- así que la PK es (id, fecha) y los hijos arrastran vuelo_fecha. Es feo
-- de escribir y barato de consultar: vale la pena cuando hay miles de vuelos.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE vuelo.vuelo (
    id                  uuid NOT NULL DEFAULT gen_random_uuid(),
    organizacion_id     uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    lote_id             uuid NOT NULL REFERENCES nucleo.lote(id) ON DELETE CASCADE,
    fecha               date NOT NULL,
    hora_inicio         timestamptz,
    camara_id           uuid REFERENCES sensor.camara(id),
    calibracion_id      uuid REFERENCES sensor.calibracion(id),

    altura_m            numeric(6,1),
    solape_frontal      smallint CHECK (solape_frontal BETWEEN 0 AND 99),
    solape_lateral      smallint CHECK (solape_lateral BETWEEN 0 AND 99),
    gsd_cm              numeric(6,2),
    nubosidad           text CHECK (nubosidad IN ('despejado','parcial','cubierto','variable')),
    angulo_solar_grados numeric(5,2),
    operador            text,

    -- LA restricción del proyecto. Un vuelo sin calibración radiométrica
    -- produce números digitales, no reflectancia: son incomparables entre
    -- fechas porque cambian con la nubosidad. La base lo impide, no lo avisa.
    comparable          boolean NOT NULL DEFAULT false,

    estado              text NOT NULL DEFAULT 'cargado'
                        CHECK (estado IN ('cargado','procesado','rechazado')),
    creado              timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (id, fecha),
    CONSTRAINT chk_comparable CHECK (comparable = false OR calibracion_id IS NOT NULL)
) PARTITION BY RANGE (fecha);

CREATE TABLE vuelo.ortomosaico (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    vuelo_id        uuid NOT NULL,
    vuelo_fecha     date NOT NULL,

    ruta_cog        text NOT NULL,           -- puntero out-db; el píxel no entra acá
    footprint       geometry(Polygon, 4326) NOT NULL,
    n_bandas        smallint NOT NULL,
    dtype           text NOT NULL DEFAULT 'uint16',

    -- Reflectancia entera escalada, como Sentinel-2: mitad de disco y de RAM
    -- que float32, con cuatro decimales de precisión.
    escala          integer NOT NULL DEFAULT 10000,

    crs             text NOT NULL,
    ancho_px        integer NOT NULL,
    alto_px         integer NOT NULL,
    sha256          char(64) NOT NULL,
    creado          timestamptz NOT NULL DEFAULT now(),

    FOREIGN KEY (vuelo_id, vuelo_fecha) REFERENCES vuelo.vuelo(id, fecha) ON DELETE CASCADE
);

CREATE TABLE vuelo.control_calidad (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    vuelo_id        uuid NOT NULL,
    vuelo_fecha     date NOT NULL,
    chequeo         text NOT NULL,           -- 'rango_reflectancia', 'solape', 'gsd', ...
    paso            boolean NOT NULL,
    motivo          text,
    FOREIGN KEY (vuelo_id, vuelo_fecha) REFERENCES vuelo.vuelo(id, fecha) ON DELETE CASCADE
);


-- ═══════════════════════════════════════════════════════════════════════
-- ÍNDICE · una capa por índice espectral. Particionada por año.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE indice.capa (
    id              uuid NOT NULL DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    ortomosaico_id  uuid NOT NULL REFERENCES vuelo.ortomosaico(id) ON DELETE CASCADE,
    fecha           date NOT NULL,           -- misma fecha del vuelo: clave de partición

    indice          text NOT NULL,           -- 'NDVI', 'NDRE', ... según catalogo/indices.json
    ruta_cog        text NOT NULL,
    escala          integer NOT NULL DEFAULT 10000,

    minimo          numeric(10,4),
    maximo          numeric(10,4),
    media           numeric(10,4),
    desvio          numeric(10,4),
    p5              numeric(10,4),
    p95             numeric(10,4),

    creada          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, fecha)
) PARTITION BY RANGE (fecha);


-- ═══════════════════════════════════════════════════════════════════════
-- MANEJO · zonas, prescripción y consejo
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE manejo.zona (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    vuelo_id        uuid NOT NULL,
    vuelo_fecha     date NOT NULL,
    numero          smallint NOT NULL,
    geom            geometry(MultiPolygon, 4326) NOT NULL,
    superficie_ha   numeric(12,4) NOT NULL,
    metodo          text NOT NULL DEFAULT 'kmeans',
    k               smallint NOT NULL,
    parametros      jsonb NOT NULL DEFAULT '{}'::jsonb,
    FOREIGN KEY (vuelo_id, vuelo_fecha) REFERENCES vuelo.vuelo(id, fecha) ON DELETE CASCADE,
    UNIQUE (vuelo_id, vuelo_fecha, numero)
);

CREATE TABLE indice.estadistica_zonal (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    capa_id         uuid NOT NULL,
    capa_fecha      date NOT NULL,
    zona_id         uuid NOT NULL REFERENCES manejo.zona(id) ON DELETE CASCADE,
    n_px            bigint NOT NULL,
    media           numeric(10,4),
    desvio          numeric(10,4),
    mediana         numeric(10,4),
    FOREIGN KEY (capa_id, capa_fecha) REFERENCES indice.capa(id, fecha) ON DELETE CASCADE
);

CREATE TABLE manejo.prescripcion (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    vuelo_id        uuid NOT NULL,
    vuelo_fecha     date NOT NULL,
    insumo          text NOT NULL,           -- 'urea', 'semilla', 'fosfato'
    unidad          text NOT NULL,           -- 'kg/ha', 'l/ha', 'semillas/ha'

    -- Qué regla generó esto y con qué versión del motor. Sin esto, una
    -- prescripción de hace dos campañas es imposible de reproducir.
    regla_id        text NOT NULL,
    version_motor   text NOT NULL,

    creada          timestamptz NOT NULL DEFAULT now(),
    creada_por      uuid REFERENCES nucleo.usuario(id),
    FOREIGN KEY (vuelo_id, vuelo_fecha) REFERENCES vuelo.vuelo(id, fecha) ON DELETE CASCADE
);

CREATE TABLE manejo.dosis (
    prescripcion_id uuid NOT NULL REFERENCES manejo.prescripcion(id) ON DELETE CASCADE,
    zona_id         uuid NOT NULL REFERENCES manejo.zona(id) ON DELETE CASCADE,
    dosis           numeric(10,3) NOT NULL CHECK (dosis >= 0),
    justificacion   text NOT NULL,
    PRIMARY KEY (prescripcion_id, zona_id)
);

CREATE TABLE manejo.recomendacion (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    vuelo_id        uuid NOT NULL,
    vuelo_fecha     date NOT NULL,
    texto           text NOT NULL,
    umbral_aplicado text,
    supuestos       jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- NOT NULL a propósito: una recomendación sin fuente es una opinión.
    fuente          text NOT NULL,

    version_motor   text NOT NULL,
    creada          timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (vuelo_id, vuelo_fecha) REFERENCES vuelo.vuelo(id, fecha) ON DELETE CASCADE
);


-- ═══════════════════════════════════════════════════════════════════════
-- CAMPO · la verdad de terreno. Sin esto, todo lo anterior es decoración.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE campo.muestra_suelo (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    lote_id         uuid NOT NULL REFERENCES nucleo.lote(id) ON DELETE CASCADE,
    geom            geometry(Point, 4326) NOT NULL,
    fecha           date NOT NULL,
    profundidad_cm  smallint,
    resultados      jsonb NOT NULL,          -- MO, N, P, K, pH, CE... según laboratorio
    laboratorio     text
);

CREATE TABLE campo.corte_biomasa (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    lote_id         uuid NOT NULL REFERENCES nucleo.lote(id) ON DELETE CASCADE,
    geom            geometry(Point, 4326) NOT NULL,
    fecha           date NOT NULL,
    superficie_m2   numeric(8,3) NOT NULL,   -- tamaño del cuadrante cortado
    peso_verde_g    numeric(10,2),
    peso_seco_g     numeric(10,2),
    kg_ms_ha        numeric(10,2) NOT NULL
);

CREATE TABLE campo.lectura_plato (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    lote_id         uuid NOT NULL REFERENCES nucleo.lote(id) ON DELETE CASCADE,
    geom            geometry(Point, 4326) NOT NULL,
    fecha           date NOT NULL,
    altura_comprimida_cm numeric(6,2) NOT NULL,
    ecuacion        text                     -- qué ecuación local se usó para pasar a kg MS/ha
);

-- La franja sobrefertilizada. Sin una fila acá, nitrogeno.py se niega a
-- recomendar dosis: sin referencia, el índice de suficiencia no existe.
CREATE TABLE campo.franja_referencia_n (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    lote_id         uuid NOT NULL REFERENCES nucleo.lote(id) ON DELETE CASCADE,
    geom            geometry(MultiPolygon, 4326) NOT NULL,
    fecha_aplicacion date NOT NULL,
    dosis_n_kg_ha   numeric(8,2) NOT NULL,
    cultivo         text NOT NULL
);


-- ═══════════════════════════════════════════════════════════════════════
-- GANADERÍA · biomasa, y la honestidad de decir cuándo el modelo no sirve
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE ganaderia.potrero (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    campo_id        uuid NOT NULL REFERENCES nucleo.campo(id) ON DELETE CASCADE,
    nombre          text NOT NULL,
    geom            geometry(MultiPolygon, 4326) NOT NULL,
    superficie_ha   numeric(12,4) NOT NULL,
    recurso         text,                    -- 'pastura', 'verdeo', 'campo natural'
    UNIQUE (campo_id, nombre)
);

CREATE TABLE ganaderia.calibracion_biomasa (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    vuelo_id        uuid NOT NULL,
    vuelo_fecha     date NOT NULL,
    indice          text NOT NULL,           -- sobre qué índice se ajustó
    modelo          text NOT NULL DEFAULT 'lineal',
    pendiente       numeric(14,6) NOT NULL,
    ordenada        numeric(14,6) NOT NULL,
    r2              numeric(5,4) NOT NULL,
    n_muestras      smallint NOT NULL,
    origen          text NOT NULL CHECK (origen IN ('corte','plato','mixto')),

    -- El umbral de 0,60 es una convención de trabajo, no una ley: por debajo
    -- de eso la relación índice↔biomasa explica menos de dos tercios de la
    -- variación y el número no debería usarse para decidir carga animal.
    -- La literatura regional reporta R² ≈ 0,41 en pasturas de verano, así que
    -- este caso NO es excepcional: es el caso frecuente, y hay que verlo.
    ajuste_pobre    boolean GENERATED ALWAYS AS (r2 < 0.60) STORED,

    creada          timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (vuelo_id, vuelo_fecha) REFERENCES vuelo.vuelo(id, fecha) ON DELETE CASCADE
);

CREATE TABLE ganaderia.disponibilidad (
    id              uuid NOT NULL DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    potrero_id      uuid NOT NULL REFERENCES ganaderia.potrero(id) ON DELETE CASCADE,
    calibracion_id  uuid NOT NULL REFERENCES ganaderia.calibracion_biomasa(id),
    fecha           date NOT NULL,
    kg_ms_ha        numeric(10,2) NOT NULL,
    kg_ms_total     numeric(14,2) NOT NULL,
    PRIMARY KEY (id, fecha)
) PARTITION BY RANGE (fecha);

CREATE TABLE ganaderia.evento_pastoreo (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    potrero_id      uuid NOT NULL REFERENCES ganaderia.potrero(id) ON DELETE CASCADE,
    categoria       text NOT NULL,           -- 'vaca cría', 'novillo', 'vaquillona'...
    cabezas         integer NOT NULL CHECK (cabezas > 0),
    peso_promedio_kg numeric(7,2),
    entrada         date NOT NULL,
    salida          date,
    CHECK (salida IS NULL OR salida >= entrada)
);


-- ═══════════════════════════════════════════════════════════════════════
-- AUDITORÍA · reproducibilidad. Particionada por año.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE auditoria.corrida (
    id              uuid NOT NULL DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES nucleo.organizacion(id) ON DELETE CASCADE,
    vuelo_id        uuid,
    vuelo_fecha     date,
    fecha           date NOT NULL DEFAULT current_date,
    inicio          timestamptz NOT NULL DEFAULT now(),
    version_motor   text NOT NULL,
    parametros      jsonb NOT NULL DEFAULT '{}'::jsonb,
    hash_entrada    char(64),
    duracion_seg    numeric(10,2),

    -- Se mide y se guarda porque el techo de esta PC es real: 16 GB, y el
    -- objetivo de diseño es no pasar de 4 GB de pico.
    pico_memoria_mb integer,

    resultado       text NOT NULL DEFAULT 'en_curso'
                    CHECK (resultado IN ('en_curso','ok','error')),
    mensaje         text,
    PRIMARY KEY (id, fecha)
) PARTITION BY RANGE (fecha);


-- ═══════════════════════════════════════════════════════════════════════
-- ÍNDICES
--
-- GIST para geometría (búsquedas espaciales), BRIN para fecha en tablas
-- particionadas: los datos entran ordenados en el tiempo, así que un BRIN
-- cuesta kilobytes donde un btree costaría cientos de megabytes.
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX idx_campo_geom          ON nucleo.campo          USING GIST (geom);
CREATE INDEX idx_lote_geom           ON nucleo.lote           USING GIST (geom);
CREATE INDEX idx_orto_footprint      ON vuelo.ortomosaico     USING GIST (footprint);
CREATE INDEX idx_zona_geom           ON manejo.zona           USING GIST (geom);
CREATE INDEX idx_potrero_geom        ON ganaderia.potrero     USING GIST (geom);
CREATE INDEX idx_muestra_suelo_geom  ON campo.muestra_suelo   USING GIST (geom);
CREATE INDEX idx_corte_geom          ON campo.corte_biomasa   USING GIST (geom);
CREATE INDEX idx_plato_geom          ON campo.lectura_plato   USING GIST (geom);
CREATE INDEX idx_franja_geom         ON campo.franja_referencia_n USING GIST (geom);

CREATE INDEX idx_vuelo_fecha         ON vuelo.vuelo           USING BRIN (fecha);
CREATE INDEX idx_capa_fecha          ON indice.capa           USING BRIN (fecha);
CREATE INDEX idx_disponib_fecha      ON ganaderia.disponibilidad USING BRIN (fecha);
CREATE INDEX idx_corrida_fecha       ON auditoria.corrida     USING BRIN (fecha);

CREATE INDEX idx_vuelo_lote          ON vuelo.vuelo (lote_id, fecha DESC);
CREATE INDEX idx_capa_orto_indice    ON indice.capa (ortomosaico_id, indice);
CREATE INDEX idx_orto_vuelo          ON vuelo.ortomosaico (vuelo_id, vuelo_fecha);


-- ═══════════════════════════════════════════════════════════════════════
-- VISTA · serie temporal, con la regla de comparabilidad aplicada
--
-- Esta vista es la única forma legítima de consultar evolución en el tiempo.
-- Filtra los vuelos no comparables en vez de dejar que alguien los grafique
-- por accidente. Es una decisión agronómica implementada como SQL.
-- ═══════════════════════════════════════════════════════════════════════

CREATE VIEW indice.serie_comparable AS
SELECT
    v.organizacion_id,
    v.lote_id,
    v.fecha,
    c.indice,
    c.media,
    c.p5,
    c.p95,
    cal.metodo AS metodo_calibracion
FROM vuelo.vuelo       v
JOIN vuelo.ortomosaico o   ON o.vuelo_id = v.id AND o.vuelo_fecha = v.fecha
JOIN indice.capa       c   ON c.ortomosaico_id = o.id
JOIN sensor.calibracion cal ON cal.id = v.calibracion_id
WHERE v.comparable = true
  AND v.estado = 'procesado';
