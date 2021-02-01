-- BLOCK instance_question_abort_manual_grading
UPDATE instance_questions
SET manual_grading_locked = FALSE
WHERE id = $instance_question_id
RETURNING *;
