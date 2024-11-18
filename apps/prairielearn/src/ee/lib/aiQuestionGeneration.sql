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

-- BLOCK update_draft_number
UPDATE pl_courses
SET
  draft_number = draft_number + 1
WHERE
  id = $course_id
RETURNING
  draft_number;

-- BLOCK insert_draft_question_metadata
INSERT INTO
  draft_question_metadata (question_id, created_by, updated_by)
SELECT
  $question_id, 
  u.user_id,
  u.user_id
FROM
  users AS u
WHERE
  u.uid = $creator_id;

-- BLOCK insert_ai_generation_prompt
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
    completion
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
    $completion
  )
  -- BLOCK select_question_by_qid_and_course
SELECT
  *
FROM
  questions
WHERE
  q.qid = $qid
  AND q.course_id = $course_id
  AND q.deleted_at IS NULL;
