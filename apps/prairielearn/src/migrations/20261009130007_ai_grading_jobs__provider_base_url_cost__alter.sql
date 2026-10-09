ALTER TABLE ai_grading_jobs
ADD COLUMN provider enum_ai_grading_provider,
ADD COLUMN base_url text,
ALTER COLUMN cost
DROP NOT NULL;
