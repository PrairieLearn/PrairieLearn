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
  share_publicly = TRUE,
  share_source_publicly = FALSE
WHERE
  id = $question_id;

-- BLOCK update_share_source_publicly
UPDATE questions
SET
  share_source_publicly = TRUE,
  share_publicly = FALSE
WHERE
  id = $question_id;
