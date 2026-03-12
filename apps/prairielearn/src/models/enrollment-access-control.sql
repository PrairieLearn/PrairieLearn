-- BLOCK delete_enrollment_rule
DELETE FROM assessment_access_control
WHERE
  id = $id
  AND target_type = 'enrollment'
  AND assessment_id = $assessment_id
  AND course_instance_id = $course_instance_id;
