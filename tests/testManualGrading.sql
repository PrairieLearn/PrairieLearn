-- BLOCK get_all_submissions
SELECT * FROM submissions;

-- BLOCK remove_all_submissions
DELETE FROM submissions;

-- BLOCK get_instance_question
SELECT *
FROM instance_questions
WHERE id = $id;

-- BLOCK get_user_by_uin
SELECT *
FROM users
WHERE uin = $uin;
