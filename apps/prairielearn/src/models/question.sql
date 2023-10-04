-- BLOCK select_question
SELECT
  *
FROM
  questions
where
  id = $question_id;
