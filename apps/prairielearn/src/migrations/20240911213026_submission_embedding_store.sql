CREATE TABLE IF NOT EXISTS submission_grading_context_embeddings (
  id bigserial PRIMARY KEY,
  embedding vector (1536),
  submission_id BIGINT NOT NULL REFERENCES submissions ON DELETE CASCADE ON UPDATE CASCADE,
  submission_text text
);

CREATE INDEX IF NOT EXISTS grading_context_embeddings_submission_id_idx ON submission_grading_context_embeddings (submission_id);
