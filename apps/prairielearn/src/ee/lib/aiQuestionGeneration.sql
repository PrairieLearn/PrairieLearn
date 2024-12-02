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
  );

-- BLOCK select_question_by_qid_and_course
SELECT
  *
FROM
  questions as q
WHERE
  q.qid = $qid
  AND q.course_id = $course_id
  AND q.deleted_at IS NULL;
