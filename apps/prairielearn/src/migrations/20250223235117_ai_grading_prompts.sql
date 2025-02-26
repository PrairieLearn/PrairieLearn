CREATE TABLE IF NOT EXISTS ai_grading_prompts (
  id bigserial PRIMARY KEY,
  submission_id BIGINT REFERENCES submissions (id) ON DELETE SET NULL ON UPDATE CASCADE,
  prompt jsonb NOT NULL,
  completion jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_grading_prompts_submission_id_idx ON ai_grading_prompts (submission_id)
