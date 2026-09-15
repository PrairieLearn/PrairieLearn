-- BLOCK select_public_columns
SELECT
  c.relname AS table_name,
  a.attname AS column_name,
  pg_catalog.format_type (a.atttypid, a.atttypmod) AS pg_type
FROM
  pg_catalog.pg_attribute AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE
  n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY
  c.relname,
  a.attnum;

-- BLOCK select_public_foreign_keys
SELECT
  con.conname AS constraint_name,
  from_cls.relname AS from_table,
  (
    SELECT
      array_agg(
        from_att.attname
        ORDER BY
          ordinality
      )
    FROM
      unnest(con.conkey) WITH ORDINALITY AS keyed (attnum, ordinality)
      JOIN pg_catalog.pg_attribute AS from_att ON from_att.attrelid = con.conrelid
      AND from_att.attnum = keyed.attnum
  ) AS from_columns,
  to_cls.relname AS to_table,
  (
    SELECT
      array_agg(
        to_att.attname
        ORDER BY
          ordinality
      )
    FROM
      unnest(con.confkey) WITH ORDINALITY AS keyed (attnum, ordinality)
      JOIN pg_catalog.pg_attribute AS to_att ON to_att.attrelid = con.confrelid
      AND to_att.attnum = keyed.attnum
  ) AS to_columns
FROM
  pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS from_cls ON from_cls.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS from_ns ON from_ns.oid = from_cls.relnamespace
  JOIN pg_catalog.pg_class AS to_cls ON to_cls.oid = con.confrelid
  JOIN pg_catalog.pg_namespace AS to_ns ON to_ns.oid = to_cls.relnamespace
WHERE
  con.contype = 'f'
  AND from_ns.nspname = 'public'
  AND to_ns.nspname = 'public'
ORDER BY
  con.conname;
