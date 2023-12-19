-- BLOCK select_lti13_instance
SELECT
  *
FROM
  lti13_instances
WHERE
  id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK select_ci_validation
SELECT
  EXISTS (
    SELECT
      1
    FROM
      lti13_course_instances
    WHERE
      course_instance_id = $course_instance_id
      --AND deleted_at IS NULL
  );
