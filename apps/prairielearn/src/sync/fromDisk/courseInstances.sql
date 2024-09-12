-- BLOCK select_valid_institution_short_names
SELECT
  short_name
FROM
  institutions
WHERE
  short_name = ANY ($short_names::TEXT[]);
