-- BLOCK reset_instance_questions
UPDATE instance_questions
SET
  status = 'unanswered',
  requires_manual_grading = FALSE
WHERE
  assessment_instance_id = $assessment_instance_id;

-- BLOCK update_instance_question
UPDATE instance_questions AS iq
SET
  status = $status,
  requires_manual_grading = $requires_manual_grading
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND aq.id = iq.assessment_question_id
  AND q.qid = $qid;

-- BLOCK delete_assessment_question
UPDATE assessment_questions AS aq
SET
  deleted_at = now()
FROM
  questions AS q
WHERE
  aq.assessment_id = $assessment_id
  AND q.id = aq.question_id
  AND q.qid = $qid;
