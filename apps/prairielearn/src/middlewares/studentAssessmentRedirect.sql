-- BLOCK select_single_assessment_instance
SELECT
  ai.id
FROM
  assessment_instances AS ai
  LEFT JOIN teams AS g ON (
    g.id = ai.team_id
    AND g.deleted_at IS NULL
  )
  LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
WHERE
  ai.assessment_id = $assessment_id
  AND ai.number = 1
  AND (
    (gu.user_id = $user_id)
    OR (ai.user_id = $user_id)
  );
