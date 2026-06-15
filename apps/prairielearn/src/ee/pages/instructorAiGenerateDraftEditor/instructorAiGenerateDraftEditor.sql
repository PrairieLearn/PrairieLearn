-- BLOCK insert_ai_question_generation_prompt
INSERT INTO
  ai_question_generation_prompts (
    question_id,
    prompting_user_id,
    prompt_type,
    user_prompt,
    system_prompt,
    response,
    html,
    python,
    errors,
    completion,
    job_sequence_id
  )
VALUES
  (
    $question_id,
    $prompting_user_id,
    $prompt_type,
    $user_prompt,
    $system_prompt,
    $response,
    $html,
    $python,
    '[]'::jsonb,
    '{}'::jsonb,
    NULL
  );

-- BLOCK select_latest_ai_question_generation_message
SELECT
  *
FROM
  ai_question_generation_messages
WHERE
  question_id = $question_id
  AND role = 'assistant'
ORDER BY
  created_at DESC
LIMIT
  1;

-- BLOCK cancel_latest_streaming_message
UPDATE ai_question_generation_messages
SET
  status = 'canceled',
  updated_at = NOW()
WHERE
  question_id = $question_id
  AND status = 'streaming'
  AND role = 'assistant';
