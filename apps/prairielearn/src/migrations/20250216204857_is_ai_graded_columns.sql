ALTER TABLE instance_questions
ADD COLUMN IF NOT EXISTS is_ai_graded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS is_ai_graded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE grading_jobs
ADD COLUMN IF NOT EXISTS is_ai_graded BOOLEAN NOT NULL DEFAULT FALSE;
