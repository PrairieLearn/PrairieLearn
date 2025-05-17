-- BLOCK select_nearby_documents
SELECT
  *
FROM
  question_generation_context_embeddings
ORDER BY
  embedding <=> $embedding
LIMIT
  $limit;

-- BLOCK select_nearby_documents_from_file
SELECT
  *
FROM
  question_generation_context_embeddings
WHERE
  doc_path = $doc_path
ORDER BY
  embedding <=> $embedding
LIMIT
  $limit;

-- BLOCK select_documents_by_chunk_id
SELECT
  *
FROM
  question_generation_context_embeddings
WHERE
  doc_path = $doc_path
  AND chunk_id = ANY ($chunk_ids);

-- BLOCK insert_draft_question_metadata
INSERT INTO
  draft_question_metadata (question_id, created_by, updated_by)
VALUES
  ($question_id, $creator_id, $creator_id);

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
    to_jsonb($errors::text[]),
    $completion,
    $job_sequence_id
  )
RETURNING
  id;

-- BLOCK update_course_instance_usages_for_ai_question_generation
INSERT INTO
  course_instance_usages (
    type,
    institution_id,
    course_id,
    course_instance_id,
    cost_ai_question_generation,
    date,
    user_id,
    include_in_statistics
  )
SELECT
  'AI question generation',
  i.id,
  c.id,
  NULL,
  $cost_ai_question_generation,
  date_trunc('day', now(), 'UTC'),
  $authn_user_id,
  false
FROM
  ai_question_generation_prompts AS p
  JOIN questions AS q ON (q.id = p.question_id)
  JOIN pl_courses AS c ON (c.id = q.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
  p.id = $prompt_id
ON CONFLICT (
  type,
  course_id,
  course_instance_id,
  date,
  user_id
) DO UPDATE
SET
  cost_ai_question_generation = course_instance_usages.cost_ai_question_generation + EXCLUDED.cost_ai_question_generation
