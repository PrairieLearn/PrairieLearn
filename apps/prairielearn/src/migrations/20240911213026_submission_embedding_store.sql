CREATE TABLE IF NOT EXISTS submission_grading_context_embeddings (
  id bigserial PRIMARY KEY,
  embedding vector (1536),
  submission_id BIGINT NOT NULL REFERENCES submissions ON DELETE CASCADE ON UPDATE CASCADE,
  submission_text text
);

CREATE INDEX ON submission_grading_context_embeddings USING hnsw (embedding vector_cosine_ops);
