-- BLOCK insert_user_message
INSERT INTO
  ai_question_generation_messages (question_id, role, status, parts)
VALUES
  ($question_id, 'user', 'completed', $parts::jsonb);

-- BLOCK insert_initial_assistant_message
INSERT INTO
  ai_question_generation_messages (
    question_id,
    job_sequence_id,
    role,
    status,
    usage_input_tokens,
    usage_output_tokens,
    usage_total_tokens
  )
VALUES
  (
    $question_id,
    $job_sequence_id,
    'assistant',
    'streaming',
    0,
    0,
    0
  )
RETURNING
  *;

-- BLOCK finalize_assistant_message
UPDATE ai_question_generation_messages
SET
  updated_at = NOW(),
  status = $status,
  parts = $parts::jsonb,
  usage_input_tokens = $usage_input_tokens,
  usage_output_tokens = $usage_output_tokens,
  usage_total_tokens = $usage_total_tokens
WHERE
  id = $id;
