-- BLOCK update_include_in_statistics_for_self_modification
UPDATE assessment_instances
SET
  include_in_statistics = FALSE,
  modified_at = now()
WHERE
  id = $assessment_instance_id
  AND include_in_statistics = TRUE;

-- BLOCK select_and_lock_assessment_instance
SELECT
  to_jsonb(ai.*) AS assessment_instance,
  to_jsonb(a.*) AS assessment
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
  ai.id = $assessment_instance_id
FOR NO KEY UPDATE OF
  ai;
