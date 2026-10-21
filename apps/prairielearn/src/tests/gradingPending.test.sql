-- BLOCK select_questions
SELECT
  to_jsonb(iq.*) AS instance_question,
  to_jsonb(aq.*) AS assessment_question,
  to_jsonb(q.*) AS question
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  iq.assessment_instance_id = $assessment_instance_id;

-- BLOCK count_score_logs
SELECT
  count(*)::integer
FROM
  assessment_score_logs
WHERE
  assessment_instance_id = $assessment_instance_id;

-- BLOCK requires_manual_grading
SELECT
  requires_manual_grading
FROM
  instance_questions
WHERE
  id = $instance_question_id;

-- BLOCK set_question_retention
UPDATE assessment_questions
SET
  deleted_at = CASE
    WHEN $deleted::boolean THEN now()
    ELSE NULL
  END,
  alternative_group_id = $alternative_group_id
WHERE
  id = $assessment_question_id;
