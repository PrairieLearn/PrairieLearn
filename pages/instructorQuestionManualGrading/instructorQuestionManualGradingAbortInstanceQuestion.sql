-- BLOCK instance_question_abort_manual_grading
UPDATE instance_questions
SET manual_grading_started_at = NULL
WHERE id = $instance_question_id
RETURNING *;
