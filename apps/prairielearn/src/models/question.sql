-- BLOCK select_question_by_id
SELECT
  *
FROM
  questions
where
  id = $question_id;
