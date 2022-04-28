-- BLOCK select_assessment_question_info
SELECT
  q.qid AS question_qid,
  a.title AS assessment_title
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
WHERE aq.id = $assessment_question_id;

-- BLOCK reset_grading
UPDATE submissions AS s
SET
  -- TODO: are we missing anything here?
  score = NULL,
  partial_scores = NULL,
  feedback = NULL,
  graded_at = NULL,
  grading_requested_at = NULL,
  correct = NULL,
  gradable = TRUE
FROM
  variants AS v
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
  s.variant_id = v.id
  AND iq.assessment_question_id = $assessment_question_id;
