-- BLOCK select_question_id
SELECT
  id
FROM
  questions
WHERE
  qid = $qid;

-- BLOCK update_shared_publicly
UPDATE questions
SET
  shared_publicly = true
WHERE
  id = $question_id;
