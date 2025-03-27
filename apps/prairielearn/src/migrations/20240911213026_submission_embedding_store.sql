CREATE TABLE IF NOT EXISTS submission_grading_context_embeddings (
  id bigserial PRIMARY KEY,
  embedding vector (1536) NOT NULL,
  submission_id BIGINT NOT NULL REFERENCES submissions ON DELETE CASCADE ON UPDATE CASCADE,
  submission_text text NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS submission_grading_context_embeddings_submission_id_idx ON submission_grading_context_embeddings (submission_id);

CREATE INDEX IF NOT EXISTS submission_grading_context_embeddings_assessment_question_id_idx ON submission_grading_context_embeddings (assessment_question_id);
