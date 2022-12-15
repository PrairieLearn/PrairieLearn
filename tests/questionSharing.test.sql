-- BLOCK enable_question_sharing
UPDATE pl_courses
SET manual_grading_visible = TRUE
WHERE id = 1;

