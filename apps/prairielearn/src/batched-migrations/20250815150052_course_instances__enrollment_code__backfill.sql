-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  course_instances;

-- BLOCK update_course_instances_enrollment_code
UPDATE course_instances
SET
  enrollment_code = $enrollment_code
WHERE
  enrollment_code IS NULL
  AND id = $id;
