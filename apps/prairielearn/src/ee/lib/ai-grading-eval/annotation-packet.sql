-- BLOCK select_instance_questions_for_identifiers
SELECT
  to_jsonb(iq.*) AS instance_question,
  COALESCE(t.name, u.uid) AS submission_identifier
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
  LEFT JOIN users AS u ON u.id = ai.user_id
  LEFT JOIN teams AS t ON t.id = ai.team_id
WHERE
  iq.assessment_question_id = $assessment_question_id
  AND COALESCE(t.name, u.uid) = ANY ($submission_identifiers::text[]);
