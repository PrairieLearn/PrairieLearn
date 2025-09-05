-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  course_instances;

-- BLOCK update_course_instances_enrollment_code
UPDATE course_instances
SET
  enrollment_code = SUBSTRING(
    MD5(RANDOM()::TEXT)
    FROM
      1 FOR 12
  )
WHERE
  enrollment_code IS NULL
  AND id >= $start
  AND id <= $end;
