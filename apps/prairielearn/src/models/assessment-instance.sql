-- BLOCK update_include_in_statistics_for_self_modification
UPDATE assessment_instances
SET
  include_in_statistics = FALSE,
  modified_at = now()
WHERE
  id = $assessment_instance_id
  AND include_in_statistics = TRUE;
