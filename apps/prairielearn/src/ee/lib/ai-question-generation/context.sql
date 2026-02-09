-- BLOCK exclude_messages_from_context
UPDATE ai_question_generation_messages
SET
  include_in_context = FALSE,
  updated_at = NOW()
WHERE
  id = ANY ($ids::bigint[]);
