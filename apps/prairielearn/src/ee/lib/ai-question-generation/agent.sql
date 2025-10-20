-- BLOCK insert_initial_assistant_message
INSERT INTO ai_question_generation_messages (
  question_id,
  role,
  usage_input_tokens,
  usage_output_tokens,
  usage_total_tokens
) VALUES (
  $question_id,
  'system',
  0,
  0,
  0
);

-- BLOCK update_message
UPDATE ai_question_generation_messages
SET
  updated_at = NOW(),
  parts = $parts,
  usage_input_tokens = $usage_input_tokens,
  usage_output_tokens = $usage_output_tokens,
  usage_total_tokens = $usage_total_tokens
WHERE id = $message_id;
