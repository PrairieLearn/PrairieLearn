-- BLOCK select_course_has_staff
SELECT
  EXISTS (
    SELECT
      1
    FROM
      course_permissions AS cp
    WHERE
      cp.course_id = $course_id
    OFFSET
      1
  )
  -- BLOCK update_course_onboarding_dismissed
UPDATE pl_courses
SET
  onboarding_dismissed = $onboarding_dismissed
WHERE
  id = $course_id
  -- BLOCK select_first_course_instance
SELECT
  *
FROM
  course_instances
WHERE
  course_id = $course_id
  AND deleted_at IS NULL
LIMIT
  1
