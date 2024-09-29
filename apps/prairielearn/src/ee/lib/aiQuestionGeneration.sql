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
