CREATE TABLE IF NOT EXISTS ai_grading_jobs (
  id bigserial PRIMARY KEY,
  grading_job_id BIGINT NOT NULL REFERENCES grading_jobs (id) ON DELETE CASCADE ON UPDATE CASCADE,
  job_sequence_id BIGINT REFERENCES job_sequences (id) ON DELETE SET NULL ON UPDATE CASCADE,
  course_id BIGINT NOT NULL REFERENCES pl_courses (id) ON DELETE CASCADE ON UPDATE CASCADE,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  prompt jsonb NOT NULL,
  completion jsonb NOT NULL,
  model text NOT NULL,
  prompt_tokens int NOT NULL,
  completion_tokens int NOT NULL,
  cost double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_grading_jobs_grading_job_id_idx ON ai_grading_jobs (grading_job_id);

CREATE INDEX IF NOT EXISTS ai_grading_jobs_job_sequence_id_idx ON ai_grading_jobs (job_sequence_id);

CREATE INDEX IF NOT EXISTS ai_grading_jobs_course_id_idx ON ai_grading_jobs (course_id);

CREATE INDEX IF NOT EXISTS ai_grading_jobs_course_instance_id_idx ON ai_grading_jobs (course_instance_id);
