ALTER TABLE grading_jobs
ADD COLUMN IF NOT EXISTS is_ai_graded BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS grading_jobs_is_ai_graded_idx ON grading_jobs (is_ai_graded);
