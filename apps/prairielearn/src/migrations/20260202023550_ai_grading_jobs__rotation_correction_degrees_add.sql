ALTER TABLE ai_grading_jobs
ADD COLUMN IF NOT EXISTS rotation_correction_degrees JSONB;
