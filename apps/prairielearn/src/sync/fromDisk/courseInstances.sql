-- BLOCK select_valid_institution_short_names
SELECT
  short_name
FROM
  institutions
WHERE
  short_name = ANY ($short_names::text[]);

-- BLOCK select_existing_enrollment_code
SELECT
  enrollment_code
FROM
  course_instances
WHERE
  enrollment_code = $enrollment_code;
