-- BLOCK select_access_control_overrides_by_enrollment_id
SELECT
  ci_overrides.*
FROM
  course_instance_access_control_overrides AS ci_overrides
  JOIN course_instance_access_control_enrollment_overrides AS ci_enrollment_overrides ON (
    ci_enrollment_overrides.course_instance_access_control_override_id = ci_overrides.id
  )
WHERE
  ci_enrollment_overrides.enrollment_id = $enrollment_id;

-- BLOCK insert_access_control_override
INSERT INTO
  course_instance_access_control_overrides (
    course_instance_id,
    enabled,
    name,
    published_end_date
  )
VALUES
  ($course_instance_id, $enabled, $name, $published_end_date)
RETURNING
  *;

-- BLOCK insert_access_control_enrollment_override
INSERT INTO
  course_instance_access_control_enrollment_overrides (
    course_instance_access_control_override_id,
    enrollment_id
  )
VALUES
  ($course_instance_access_control_override_id, $enrollment_id)
RETURNING
  *;
