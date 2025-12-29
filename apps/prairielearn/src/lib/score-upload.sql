-- BLOCK select_assessment_instance_uid
SELECT
  ai.id AS assessment_instance_id
FROM
  assessment_instances AS ai
  JOIN users AS u ON (u.id = ai.user_id)
WHERE
  ai.assessment_id = $assessment_id
  AND ai.number = $instance_number
  AND u.uid = $uid
FOR UPDATE OF
  ai;

-- BLOCK select_assessment_instance_group
SELECT
  ai.id AS assessment_instance_id
FROM
  assessment_instances AS ai
  JOIN teams AS g ON (g.id = ai.team_id)
WHERE
  ai.assessment_id = $assessment_id
  AND ai.number = $instance_number
  AND g.name = $group_name
FOR UPDATE OF
  ai;

-- BLOCK select_submission_to_update
SELECT
  s.id AS submission_id,
  iq.id AS instance_question_id,
  COALESCE(g.name, u.uid) AS uid_or_group,
  q.qid
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  LEFT JOIN teams AS g ON (
    g.id = ai.team_id
    AND g.deleted_at IS NULL
  )
  LEFT JOIN users AS u ON (u.id = ai.user_id)
  LEFT JOIN variants AS v ON (v.instance_question_id = iq.id)
  LEFT JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  ai.assessment_id = $assessment_id
  AND (
    s.id = $submission_id
    OR (
      $submission_id IS NULL
      AND COALESCE(g.name, u.uid) = $uid_or_group
      AND ai.number = $ai_number
      AND q.qid = $qid
    )
  )
ORDER BY
  s.date DESC NULLS LAST,
  s.id DESC NULLS LAST
LIMIT
  1
FOR NO KEY UPDATE OF
  iq;
