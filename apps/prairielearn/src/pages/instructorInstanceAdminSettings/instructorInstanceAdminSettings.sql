-- BLOCK short_names
SELECT
  ci.short_name
FROM
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
ORDER BY
  ci.short_name;

-- BLOCK select_enrollment_count
SELECT
  COUNT(*)
FROM
  enrollments AS e
WHERE
  e.course_instance_id = $course_instance_id;

-- BLOCK select_has_allow_access_rules
SELECT
  EXISTS(
    SELECT
      1
    FROM
      course_instance_access_rules AS ciar
    WHERE
      ciar.course_instance_id = $course_instance_id
  );

-- BLOCK update_enrollment_code
UPDATE course_instances
SET
  enrollment_code = $enrollment_code
WHERE
  id = $course_instance_id;
