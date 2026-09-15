-- BLOCK has_expected_primary_key
SELECT
  EXISTS (
    SELECT
      1
    FROM
      pg_constraint AS c
      JOIN pg_attribute AS a ON (
        a.attrelid = c.conrelid
        AND c.conkey = ARRAY[a.attnum]
      )
    WHERE
      c.conrelid = to_regclass($table_name)
      AND c.contype = 'p'
      AND a.attname = $primary_key_column_name
  );
