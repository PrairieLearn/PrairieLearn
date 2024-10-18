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

-- BLOCK insert_draft_info
INSERT INTO
  questions_draft_metadata (id, draft_created_by, draft_updated_by)
SELECT
  q.id,
  u.user_id,
  u.user_id
FROM
  questions AS q,
  users AS u
WHERE
  q.qid = $qid
  AND q.course_id = $course_id
  AND u.uid = $creator_id;
