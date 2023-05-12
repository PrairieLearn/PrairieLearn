-- BLOCK select_single_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai
  LEFT JOIN groups AS g ON (
    g.id = ai.group_id
    AND g.deleted_at IS NULL
  )
  LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
WHERE
  ai.assessment_id = $assessment_id
  AND ai.number = 1
  AND (
    (gu.user_id = $user_id)
    OR (ai.user_id = $user_id)
  );
