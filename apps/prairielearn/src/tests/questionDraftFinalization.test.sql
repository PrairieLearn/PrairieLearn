-- BLOCK select_draft_question_metadata
SELECT
  id
FROM
  draft_question_metadata
WHERE
  question_id = $question_id;

-- BLOCK update_question_sync_errors
UPDATE questions
SET
  sync_errors = $sync_errors
WHERE
  id = $question_id;
