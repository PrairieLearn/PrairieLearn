-- BLOCK clear_access_control_rule_uuid
UPDATE assessment_access_control_rules
SET
  uuid = NULL
WHERE
  id = $id
  AND assessment_id = $assessment_id
  AND target_type = 'enrollment';

-- BLOCK ensure_access_control_rule_uuid
UPDATE assessment_access_control_rules
SET
  uuid = COALESCE(uuid, gen_random_uuid())
WHERE
  id = $id
  AND assessment_id = $assessment_id
  AND target_type = 'enrollment'
RETURNING
  uuid::text;
