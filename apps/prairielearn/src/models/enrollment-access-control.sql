-- BLOCK delete_enrollment_rule
DELETE FROM assessment_access_control
WHERE
  id = $id
  AND target_type = 'enrollment';
