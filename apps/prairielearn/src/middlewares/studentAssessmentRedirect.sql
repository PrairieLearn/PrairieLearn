-- BLOCK select_single_assessment_instance
SELECT
  ai.id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN teams AS g ON (
    g.id = ai.team_id
    AND g.deleted_at IS NULL
  )
  LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
WHERE
  ai.assessment_id = $assessment_id
  AND ai.number = 1
  AND (CASE WHEN a.team_work THEN gu.user_id ELSE ai.user_id END) = $user_id;
