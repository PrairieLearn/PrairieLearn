-- BLOCK select_nearby_documents
SELECT
  *
FROM
  question_generation_context_embeddings
ORDER BY
  embedding <=> $embedding
LIMIT
  $limit;
