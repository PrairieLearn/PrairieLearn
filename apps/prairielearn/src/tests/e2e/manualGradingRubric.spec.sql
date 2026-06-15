-- BLOCK select_instance_question_for_manual_grading
SELECT
  iq.id
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  ai.assessment_id = $assessment_id
  AND q.qid = $qid
  AND iq.requires_manual_grading = true
ORDER BY
  iq.id DESC
LIMIT
  1;
