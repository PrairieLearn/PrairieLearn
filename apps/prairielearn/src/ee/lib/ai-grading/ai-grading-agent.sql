-- BLOCK insert_user_message
INSERT INTO
  ai_grading_messages (
    assessment_question_id,
    authn_user_id,
    role,
    status,
    phase,
    parts
  )
VALUES
  (
    $assessment_question_id,
    $authn_user_id,
    'user',
    'completed',
    $phase,
    $parts::jsonb
  );

-- BLOCK insert_initial_assistant_message
INSERT INTO
  ai_grading_messages (
    assessment_question_id,
    job_sequence_id,
    role,
    status,
    phase,
    model,
    usage_input_tokens,
    usage_input_tokens_cache_read,
    usage_input_tokens_cache_write,
    usage_output_tokens,
    usage_output_tokens_reasoning
  )
VALUES
  (
    $assessment_question_id,
    $job_sequence_id,
    'assistant',
    'streaming',
    $phase,
    $model,
    0,
    0,
    0,
    0,
    0
  )
RETURNING
  *;

-- BLOCK finalize_assistant_message
UPDATE ai_grading_messages
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
  AND status = 'streaming';
