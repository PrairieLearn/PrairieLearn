-- BLOCK clear_placeholder_reference
UPDATE questions AS q
SET
  qid = NULL
FROM
  assessment_questions AS aq
WHERE
  aq.question_id = q.id
  AND aq.assessment_id = $assessment_id
  AND aq.deleted_at IS NULL
  AND q.qid = $qid;
