-- BLOCK get_tables
SELECT DISTINCT
  table_name
FROM
  information_schema.tables
WHERE
  table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema');

-- BLOCK get_columns
SELECT
  *
FROM
  information_schema.columns
WHERE
  table_name = $table_name;
