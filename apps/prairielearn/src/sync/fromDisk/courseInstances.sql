-- BLOCK select_valid_institution_short_names
-- Receives an array of short names. Should return rows, each one containing
-- a short name if the institution exists. If the institution does not exist,
-- don't return a row for that short name.
SELECT
  short_name
FROM
  institutions
WHERE
  short_name = ANY ($short_names::TEXT[]);
