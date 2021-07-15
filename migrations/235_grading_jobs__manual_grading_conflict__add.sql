ALTER TABLE grading_jobs ADD COLUMN IF NOT EXISTS manual_grading_conflict boolean DEFAULT false;
