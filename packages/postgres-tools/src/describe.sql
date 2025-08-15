-- BLOCK get_tables
SELECT
  c.relname AS name,
  c.oid AS oid
FROM
  pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE
  c.relkind = 'r'
  AND n.nspname != 'pg_catalog'
  AND n.nspname != 'information_schema'
  AND n.nspname !~ '^pg_toast'
  AND pg_catalog.pg_table_is_visible (c.oid)
ORDER BY
  c.relname;

-- BLOCK get_columns_for_table
SELECT
  a.attname AS name,
  pg_catalog.format_type (a.atttypid, a.atttypmod) AS type,
  a.attnotnull AS notnull,
  (
    SELECT
      substring(
        pg_catalog.pg_get_expr (d.adbin, d.adrelid) for 128
      )
    FROM
      pg_catalog.pg_attrdef d
    WHERE
      d.adrelid = a.attrelid
      AND d.adnum = a.attnum
      AND a.atthasdef
  ) AS default
FROM
  pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
WHERE
  a.attrelid = $oid
  AND NOT a.attisdropped
  AND a.attnum > 0
ORDER BY
  a.attname;

-- BLOCK get_indexes_for_table
SELECT
  c2.relname AS name,
  i.indisprimary AS isprimary,
  i.indisunique AS isunique,
  pg_catalog.pg_get_indexdef (i.indexrelid, 0, true) AS indexdef,
  pg_catalog.pg_get_constraintdef (con.oid, true) AS constraintdef,
  contype
FROM
  pg_catalog.pg_class c,
  pg_catalog.pg_class c2,
  pg_catalog.pg_index i
  LEFT JOIN pg_catalog.pg_constraint con ON (
    conrelid = i.indrelid
    AND conindid = i.indexrelid
    AND contype IN ('p', 'u')
  )
WHERE
  c.oid = $oid
  AND c.oid = i.indrelid
  AND i.indexrelid = c2.oid
ORDER BY
  i.indisprimary DESC,
  i.indisunique DESC,
  c2.relname;

-- BLOCK get_references_for_table
SELECT
  conname AS name,
  conrelid::pg_catalog.regclass AS table,
  pg_catalog.pg_get_constraintdef (c.oid, true) as condef
FROM
  pg_catalog.pg_constraint c
WHERE
  c.confrelid = $oid
  AND c.contype = 'f'
ORDER BY
  conname;

-- BLOCK get_foreign_key_constraints_for_table
SELECT
  conname AS name,
  pg_catalog.pg_get_constraintdef (r.oid, true) as def
FROM
  pg_catalog.pg_constraint r
WHERE
  r.conrelid = $oid
  AND r.contype = 'f'
ORDER BY
  1;

-- BLOCK get_check_constraints_for_table
SELECT
  conname AS name,
  pg_catalog.pg_get_constraintdef (r.oid, true) as def
FROM
  pg_catalog.pg_constraint r
WHERE
  r.conrelid = $oid
  AND r.contype = 'c'
ORDER BY
  1;

-- BLOCK get_enums
SELECT
  t.typname AS name,
  ARRAY(
    SELECT
      e.enumlabel
    FROM
      pg_catalog.pg_enum e
    WHERE
      e.enumtypid = t.oid
    ORDER BY
      e.enumsortorder
  ) AS
values
FROM
  pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
GROUP BY
  n.nspname,
  t.typname,
  t.oid;
