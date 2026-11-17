-- BLOCK get_migrations_table
SELECT
  to_regclass('public.migrations')::text AS name;
