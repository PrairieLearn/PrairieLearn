-- BLOCK submission_abort_manual_grading
UPDATE submissions
SET manual_grading_user = NULL
WHERE id = $instance_question_id
RETURNING *;
