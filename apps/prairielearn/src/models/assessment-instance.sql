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

-- BLOCK select_assessment_instance_by_id
SELECT
  *
FROM
  assessment_instances
WHERE
  id = $assessment_instance_id;

-- BLOCK insert_group_assessment_instance
INSERT INTO
  assessment_instances (auth_user_id, assessment_id, team_id, number)
VALUES
  ($authn_user_id, $assessment_id, $team_id, 1)
RETURNING
  *;
