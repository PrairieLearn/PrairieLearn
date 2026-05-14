-- BLOCK select_draft_question_metadata
SELECT
  id
FROM
  draft_question_metadata
WHERE
  question_id = $question_id;
