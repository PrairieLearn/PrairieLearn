-- BLOCK get_tables
SELECT c.relname AS name,
    c.oid AS oid
FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
    AND n.nspname != 'pg_catalog'
    AND n.nspname != 'information_schema'
    AND n.nspname !~ '^pg_toast'
    AND pg_catalog.pg_table_is_visible(c.oid)
ORDER BY c.relname;

-- BLOCK get_columns_for_table
SELECT a.attname AS name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
    a.attnotnull AS notnull,
    (SELECT substring(pg_catalog.pg_get_expr(d.adbin, d.adrelid) for 128)
        FROM pg_catalog.pg_attrdef d
        WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum AND a.atthasdef) AS default
FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
WHERE a.attrelid = $oid
    AND NOT a.attisdropped
    AND a.attnum > 0
ORDER BY a.attnum;
