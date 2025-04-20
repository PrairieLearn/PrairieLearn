ALTER TABLE submissions
ADD COLUMN partial_scores jsonb;

ALTER TABLE grading_jobs
ADD COLUMN partial_scores jsonb;
