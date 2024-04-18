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
WITH
  course_instance_enrollments AS (
    SELECT
      ci.id AS course_instance_id,
      COALESCE(COUNT(e.id), 0)::integer AS enrollment_count
    FROM
      course_instances AS ci
      JOIN pl_courses AS c ON (ci.course_id = c.id)
      LEFT JOIN enrollments AS e ON (ci.id = e.course_instance_id)
    WHERE
      ci.course_id = $course_id
      AND ci.deleted_at IS NULL
    GROUP BY
      ci.id
  ),
  course_instance_dates AS (
    SELECT
      ci.id AS course_instance_id,
      MIN(ciar.start_date) AS min_start_date,
      MAX(ciar.end_date) AS max_end_date
    FROM
      course_instances AS ci
      LEFT JOIN course_instance_access_rules AS ciar ON (ci.id = ciar.course_instance_id)
    WHERE
      ci.course_id = $course_id
      AND ci.deleted_at IS NULL
    GROUP BY
      ci.id
  )
SELECT
  to_jsonb(ci.*) AS course_instance,
  cia.enrollment_count
FROM
  course_instance_enrollments AS cia
  JOIN course_instance_dates AS cid ON (cia.course_instance_id = cid.course_instance_id)
  JOIN course_instances AS ci ON (cia.course_instance_id = ci.id)
ORDER BY
  cid.min_start_date DESC NULLS LAST,
  cid.max_end_date DESC NULLS LAST,
  ci.id DESC;

-- BLOCK update_enrollment_limits
UPDATE pl_courses AS c
SET
  yearly_enrollment_limit = $yearly_enrollment_limit,
  course_instance_enrollment_limit = $course_instance_enrollment_limit
WHERE
  id = $course_id
RETURNING
  c.*;
