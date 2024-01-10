-- BLOCK select_institution_statistics
WITH
  course_statistics AS (
    SELECT
      COUNT(*)::integer AS course_count
    FROM
      pl_courses
    WHERE
      pl_courses.institution_id = $institution_id
  ),
  course_instance_statistics AS (
    SELECT
      COUNT(ci.*)::integer AS course_instance_count
    FROM
      course_instances AS ci
      JOIN pl_courses AS c ON (ci.course_id = c.id)
    WHERE
      c.institution_id = $institution_id
  ),
  enrollment_statistics AS (
    SELECT
      COUNT(e.*)::integer AS enrollment_count
    FROM
      enrollments AS e
      JOIN course_instances AS ci ON (e.course_instance_id = ci.id)
      JOIN pl_courses AS c ON (ci.course_id = c.id)
    WHERE
      c.institution_id = $institution_id
  )
SELECT
  course_count,
  course_instance_count,
  enrollment_count
FROM
  course_statistics,
  course_instance_statistics,
  enrollment_statistics;

-- BLOCK update_institution
UPDATE institutions
SET
  short_name = $short_name,
  long_name = $long_name,
  display_timezone = $display_timezone,
  uid_regexp = $uid_regexp,
  yearly_enrollment_limit = $yearly_enrollment_limit,
  course_instance_enrollment_limit = $course_instance_enrollment_limit
WHERE
  id = $institution_id
RETURNING
  institutions.*;
