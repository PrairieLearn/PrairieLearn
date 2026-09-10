-- BLOCK update_institution_limits
UPDATE institutions
SET
  course_instance_enrollment_limit = $institutionLimit,
  yearly_enrollment_limit = $institutionYearlyLimit
WHERE
  id = 1;

-- BLOCK update_course_limits
UPDATE courses
SET
  course_instance_enrollment_limit = $courseLimit,
  yearly_enrollment_limit = $courseYearlyLimit
WHERE
  id = 1;

-- BLOCK update_instance_limit
UPDATE course_instances
SET
  enrollment_limit = $instanceLimit
WHERE
  id = 1;

-- BLOCK mark_enrollment_removed
UPDATE enrollments
SET
  status = 'removed'
WHERE
  course_instance_id = 1
  AND user_id = (
    SELECT
      id
    FROM
      users
    WHERE
      uid = 'student2@example.com'
  );

-- BLOCK age_enrollments
UPDATE enrollments
SET
  created_at = now() - interval '2 years'
WHERE
  course_instance_id = 1;
