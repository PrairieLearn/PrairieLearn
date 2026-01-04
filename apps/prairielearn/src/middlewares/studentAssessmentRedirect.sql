-- BLOCK select_single_assessment_instance
SELECT
  ai.id
FROM
  assessment_instances AS ai
  LEFT JOIN teams AS t ON (
    t.id = ai.team_id
    AND t.deleted_at IS NULL
  )
  LEFT JOIN team_users AS tu ON (tu.team_id = t.id)
WHERE
  ai.assessment_id = $assessment_id
  AND ai.number = 1
  AND (
    (tu.user_id = $user_id)
    OR (ai.user_id = $user_id)
  );
