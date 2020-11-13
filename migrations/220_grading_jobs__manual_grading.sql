ALTER TABLE grading_jobs ADD COLUMN IF NOT EXISTS manual_score double precision;
ALTER TABLE grading_jobs ADD COLUMN IF NOT EXISTS weight_score double precision;
