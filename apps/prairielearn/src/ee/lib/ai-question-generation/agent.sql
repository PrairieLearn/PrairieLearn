-- BLOCK insert_user_message
INSERT INTO ai_question_generation_messages (
  question_id,
  role,
  parts
) VALUES (
  $question_id,
  'user',
  $parts::jsonb
);

-- BLOCK insert_initial_assistant_message
INSERT INTO ai_question_generation_messages (
  question_id,
  job_sequence_id,
  role,
  usage_input_tokens,
  usage_output_tokens,
  usage_total_tokens
) VALUES (
  $question_id,
  $job_sequence_id,
  'system',
  0,
  0,
  0
) RETURNING *;

-- BLOCK update_message
UPDATE ai_question_generation_messages
SET
  updated_at = NOW(),
  parts = $parts::jsonb,
  usage_input_tokens = $usage_input_tokens,
  usage_output_tokens = $usage_output_tokens,
  usage_total_tokens = $usage_total_tokens
WHERE id = $id;
