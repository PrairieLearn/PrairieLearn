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
    model,
    usage_input_tokens,
    usage_input_tokens_cache_read,
    usage_input_tokens_cache_write,
    usage_output_tokens,
    usage_output_tokens_reasoning
  )
VALUES
  (
    $question_id,
    $job_sequence_id,
    'assistant',
    'streaming',
    $model,
    0,
    0,
    0,
    0,
    0
  )
RETURNING
  *;

-- BLOCK select_message_status
SELECT
  status
FROM
  ai_question_generation_messages
WHERE
  id = $id;

-- BLOCK finalize_assistant_message
UPDATE ai_question_generation_messages
SET
  updated_at = NOW(),
  status = $status,
  parts = $parts::jsonb,
  model = $model,
  usage_input_tokens = $usage_input_tokens,
  usage_input_tokens_cache_read = $usage_input_tokens_cache_read,
  usage_input_tokens_cache_write = $usage_input_tokens_cache_write,
  usage_output_tokens = $usage_output_tokens,
  usage_output_tokens_reasoning = $usage_output_tokens_reasoning
WHERE
  id = $id
  -- Only update if still streaming; prevents overwriting 'canceled' status
  -- if user clicked stop after we checked but before we finalized.
  AND status = 'streaming';
