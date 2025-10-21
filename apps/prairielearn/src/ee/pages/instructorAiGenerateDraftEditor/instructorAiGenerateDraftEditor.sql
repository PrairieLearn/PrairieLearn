-- BLOCK select_ai_question_generation_prompts
SELECT
  ai_question_generation_prompts.*
FROM
  ai_question_generation_prompts
  JOIN questions ON ai_question_generation_prompts.question_id = questions.id
WHERE
  questions.id = $question_id
  AND questions.course_id = $course_id
  AND questions.deleted_at IS NULL
ORDER BY
  ai_question_generation_prompts.id;

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

-- BLOCK select_ai_question_generation_prompt_by_id_and_question
SELECT
  *
FROM
  ai_question_generation_prompts
WHERE
  id = $prompt_id
  AND question_id = $question_id;

-- BLOCK select_ai_question_generation_messages
SELECT * FROM ai_question_generation_messages WHERE question_id = $question_id ORDER BY created_at ASC;

-- BLOCK select_latest_ai_question_generation_message
SELECT * FROM ai_question_generation_messages WHERE question_id = $question_id AND role = 'assistant' ORDER BY created_at DESC LIMIT 1;
