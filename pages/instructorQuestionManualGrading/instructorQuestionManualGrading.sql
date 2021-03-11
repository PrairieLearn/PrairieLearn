-- BLOCK instance_question_abort_manual_grading
UPDATE instance_questions
    SET manual_grading_user = NULL
    WHERE 
        id = $instance_question_id
        AND graded_at IS NULL
RETURNING *;
