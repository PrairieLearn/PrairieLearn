CREATE TABLE IF NOT EXISTS submission_grading_context_embeddings (
  id bigserial PRIMARY KEY,
  embedding vector (1536) NOT NULL,
  submission_id BIGINT NOT NULL REFERENCES submissions ON DELETE CASCADE ON UPDATE CASCADE,
  submission_text text NOT NULL
);

CREATE INDEX IF NOT EXISTS submission_grading_context_embeddings_submission_id_idx ON submission_grading_context_embeddings (submission_id);
