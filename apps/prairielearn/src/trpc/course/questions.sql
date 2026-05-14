-- BLOCK insert_draft_question_metadata
INSERT INTO
  draft_question_metadata (question_id, created_by, updated_by)
VALUES
  ($question_id, $creator_id, $creator_id)
ON CONFLICT (question_id) DO NOTHING;
