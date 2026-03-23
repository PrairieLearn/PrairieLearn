-- BLOCK insert_user_message
INSERT INTO
  ai_grading_messages (
    assessment_question_id,
    authn_user_id,
    role,
    status,
    phase,
    parts,
    workflow_run_id
  )
VALUES
  (
    $assessment_question_id,
    $authn_user_id,
    'user',
    'completed',
    $phase,
    $parts::jsonb,
    $workflow_run_id
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
    usage_output_tokens_reasoning,
    workflow_run_id
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
    0,
    $workflow_run_id
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

-- BLOCK insert_grading_job
INSERT INTO
  grading_jobs (
    submission_id,
    auth_user_id,
    graded_by,
    graded_at,
    grading_method,
    correct,
    score,
    auto_points,
    manual_points,
    feedback,
    manual_rubric_grading_id
  )
VALUES
  (
    $submission_id,
    $authn_user_id,
    $authn_user_id,
    now(),
    $grading_method,
    $correct,
    $score,
    $auto_points,
    $manual_points,
    $feedback,
    $manual_rubric_grading_id
  )
RETURNING
  id;
