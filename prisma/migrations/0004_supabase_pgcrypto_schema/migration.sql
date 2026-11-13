-- Supabase instala pgcrypto en el esquema extensions, mientras que la
-- migración 0002 histórica referenciaba public.hmac. En PostgreSQL local,
-- pgcrypto permanece en public y no requiere compatibilidad adicional.
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.hmac(p_data bytea, p_key bytea, p_type text)
      RETURNS bytea
      LANGUAGE sql
      IMMUTABLE
      STRICT
      SET search_path = pg_catalog, extensions
      AS 'SELECT extensions.hmac(p_data, p_key, p_type)';
    $sql$;
  END IF;
END;
$migration$;
