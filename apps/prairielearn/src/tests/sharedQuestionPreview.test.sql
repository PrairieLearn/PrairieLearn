-- BLOCK select_question_id
SELECT
  id
FROM
  questions
WHERE
  qid = $qid
  AND course_id = 1;

-- BLOCK update_share_publicly
UPDATE questions
SET
  share_publicly = true
WHERE
  id = $question_id;
