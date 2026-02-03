-- BLOCK select_course
SELECT
  *
FROM
  courses
WHERE
  id = $course_id
  AND institution_id = $institution_id
  AND deleted_at IS NULL;

-- BLOCK select_course_instances
WITH
  course_instance_enrollments AS (
    SELECT
      ci.id AS course_instance_id,
      COALESCE(COUNT(e.id), 0)::integer AS enrollment_count
    FROM
      course_instances AS ci
      JOIN courses AS c ON (ci.course_id = c.id)
      LEFT JOIN enrollments AS e ON (ci.id = e.course_instance_id)
    WHERE
      ci.course_id = $course_id
    GROUP BY
      ci.id
  )
SELECT
  to_jsonb(ci.*) AS course_instance,
  cia.enrollment_count
FROM
  course_instance_enrollments AS cia
  JOIN course_instances AS ci ON (cia.course_instance_id = ci.id),
  LATERAL (
    SELECT
      COALESCE(ci.publishing_start_date, min(ar.start_date)) AS start_date,
      COALESCE(ci.publishing_end_date, max(ar.end_date)) AS end_date
    FROM
      course_instance_access_rules AS ar
    WHERE
      ar.course_instance_id = ci.id
  ) AS d
ORDER BY
  d.start_date DESC NULLS LAST,
  d.end_date DESC NULLS LAST,
  ci.id DESC;

-- BLOCK update_enrollment_limits
UPDATE courses AS c
SET
  yearly_enrollment_limit = $yearly_enrollment_limit,
  course_instance_enrollment_limit = $course_instance_enrollment_limit
WHERE
  id = $course_id
RETURNING
  c.*;
