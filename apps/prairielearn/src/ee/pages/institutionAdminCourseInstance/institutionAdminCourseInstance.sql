-- BLOCK select_course_and_instance
SELECT
  to_jsonb(c.*) AS course,
  to_jsonb(ci.*) AS course_instance
FROM
  pl_courses AS c
  JOIN course_instances AS ci ON (ci.course_id = c.id)
WHERE
  c.institution_id = $institution_id
  AND c.deleted_at IS NULL
  AND ci.id = $course_instance_id
  AND ci.deleted_at IS NULL;

-- BLOCK update_enrollment_limit
UPDATE course_instances AS ci
SET
  enrollment_limit = $enrollment_limit
WHERE
  ci.id = $course_instance_id;
