-- BLOCK insert_user_message
INSERT INTO
  ai_grading_messages (
    assessment_question_id,
    authn_user_id,
    phase,
    parts,
    status,
    role,
    workflow_run_id,
    rubric_snapshot
  )
VALUES
  (
    $assessment_question_id,
    $authn_user_id,
    $phase::enum_ai_grading_message_phase,
    $parts::jsonb,
    'completed',
    'user',
    $workflow_run_id,
    $rubric_snapshot::jsonb
  )
RETURNING
  id;

-- BLOCK insert_initial_assistant_message
INSERT INTO
  ai_grading_messages (
    assessment_question_id,
    phase,
    model,
    status,
    role,
    workflow_run_id
  )
VALUES
  (
    $assessment_question_id,
    $phase::enum_ai_grading_message_phase,
    $model,
    'streaming',
    'assistant',
    $workflow_run_id
  )
RETURNING
  *;

-- BLOCK finalize_assistant_message
UPDATE ai_grading_messages
SET
  status = $status::enum_ai_question_generation_message_status,
  parts = $parts::jsonb,
  model = $model,
  usage_input_tokens = $usage_input_tokens,
  usage_input_tokens_cache_read = $usage_input_tokens_cache_read,
  usage_input_tokens_cache_write = $usage_input_tokens_cache_write,
  usage_output_tokens = $usage_output_tokens,
  usage_output_tokens_reasoning = $usage_output_tokens_reasoning,
  rubric_snapshot = $rubric_snapshot::jsonb,
  updated_at = NOW()
WHERE
  id = $id;

-- BLOCK select_message_status
SELECT
  status
FROM
  ai_grading_messages
WHERE
  id = $id;
