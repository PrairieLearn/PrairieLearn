-- BLOCK mark_instance_question_for_manual_grading
UPDATE instance_questions
SET
  status = 'complete',
  requires_manual_grading = TRUE
WHERE
  assessment_instance_id = $assessment_instance_id
  AND assessment_question_id = $assessment_question_id;
