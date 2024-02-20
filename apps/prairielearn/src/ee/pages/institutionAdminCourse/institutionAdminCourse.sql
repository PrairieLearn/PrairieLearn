-- BLOCK select_course
SELECT
  *
FROM
  pl_courses
WHERE
  id = $course_id
  AND institution_id = $institution_id
  AND deleted_at IS NULL;

-- BLOCK select_course_instances
SELECT
  to_jsonb(ci.*) AS course_instance,
  COALESCE(COUNT(e.id), 0)::integer AS enrollment_count
FROM
  course_instances AS ci
  JOIN pl_courses AS c ON (ci.course_id = c.id)
  LEFT JOIN enrollments AS e ON (ci.id = e.course_instance_id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND c.institution_id = $institution_id
  AND c.deleted_at IS NULL
GROUP BY
  ci.id;

-- BLOCK update_enrollment_limits
UPDATE pl_courses AS c
SET
  yearly_enrollment_limit = $yearly_enrollment_limit,
  course_instance_enrollment_limit = $course_instance_enrollment_limit
WHERE
  id = $course_id;
