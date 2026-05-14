-- BLOCK delete_draft_question_metadata
DELETE FROM draft_question_metadata
WHERE
  question_id = $question_id;
