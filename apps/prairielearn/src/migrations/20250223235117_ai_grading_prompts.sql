CREATE TABLE IF NOT EXISTS ai_grading_prompts (
  id bigserial PRIMARY KEY,
  grading_job_id BIGINT REFERENCES grading_jobs (id) ON DELETE SET NULL ON UPDATE CASCADE,
  job_sequence_id BIGINT REFERENCES job_sequences (id) ON DELETE SET NULL ON UPDATE CASCADE,
  course_id BIGINT REFERENCES courses (course_id) ON DELETE SET NULL ON UPDATE CASCADE,
  course_instance_id BIGINT REFERENCES course_instances (id) ON DELETE SET NULL ON UPDATE CASCADE,
  prompt jsonb NOT NULL,
  completion jsonb NOT NULL,
  model text NOT NULL,
  prompt_tokens int NOT NULL,
  completion_tokens int NOT NULL,
  cost double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_grading_prompts_grading_job_id_idx ON ai_grading_prompts (grading_job_id);

CREATE INDEX IF NOT EXISTS ai_grading_prompts_job_sequence_id_idx ON ai_grading_prompts (job_sequence_id);

CREATE INDEX IF NOT EXISTS ai_grading_prompts_course_id_idx ON ai_grading_prompts (course_id);

CREATE INDEX IF NOT EXISTS ai_grading_prompts_course_instance_id_idx ON ai_grading_prompts (course_instance_id);
