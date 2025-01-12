-- BLOCK insert_embedding
INSERT INTO
  question_generation_context_embeddings (doc_path, doc_text, embedding, chunk_id)
VALUES
  ($doc_path, $doc_text, $embedding, $chunk_id)
ON CONFLICT (doc_path, chunk_id) DO
UPDATE
SET
  doc_text = EXCLUDED.doc_text,
  embedding = EXCLUDED.embedding;

-- BLOCK check_doc_chunk_exists
SELECT
  *
FROM
  question_generation_context_embeddings
WHERE
  doc_path = $doc_path
  AND chunk_id = $chunk_id;

-- BLOCK delete_unused_doc_chunks
DELETE FROM question_generation_context_embeddings
WHERE
  doc_path <> ALL ($doc_paths)
  OR chunk_id <> ALL ($chunk_ids);
