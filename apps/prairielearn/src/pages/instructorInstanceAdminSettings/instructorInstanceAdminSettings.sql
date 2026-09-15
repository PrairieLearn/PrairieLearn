-- BLOCK select_names
SELECT
  ci.short_name,
  ci.long_name
FROM
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL;

-- BLOCK select_enrollment_count
SELECT
  COUNT(e.user_id)::integer AS enrollment_count
FROM
  enrollments AS e
WHERE
  e.course_instance_id = $course_instance_id
  AND e.status = 'joined'
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id);

-- BLOCK select_access_control_migration_needed
SELECT
  EXISTS (
    SELECT
      1
    FROM
      assessments AS a
      JOIN assessment_access_rules AS aar ON aar.assessment_id = a.id
    WHERE
      a.course_instance_id = $course_instance_id
      AND a.deleted_at IS NULL
  ) AS migration_needed;

-- BLOCK update_enrollment_code
UPDATE course_instances
SET
  enrollment_code = $enrollment_code
WHERE
  id = $course_instance_id;
