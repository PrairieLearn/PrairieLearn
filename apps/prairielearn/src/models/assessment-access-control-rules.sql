-- BLOCK delete_enrollment_rules_by_ids
DELETE FROM assessment_access_control_rules
WHERE
  id = ANY ($ids::bigint[])
  AND target_type = 'enrollment'
  AND assessment_id = $assessment_id;
