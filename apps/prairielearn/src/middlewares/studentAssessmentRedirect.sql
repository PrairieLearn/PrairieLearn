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
  AND (
    (gu.user_id = $user_id)
    OR (ai.user_id = $user_id)
  )
  -- Skip stale instances: if team_work was enabled after this instance was
  -- created (e.g. instructor previewed, then added groups config), the
  -- instance has user_id set but no team_id. Don't redirect to it; let the
  -- student assessment page show the group join/create UI instead.
  AND (
    NOT a.team_work
    OR ai.team_id IS NOT NULL
  );
