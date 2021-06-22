ALTER TABLE submissions ADD COLUMN IF NOT EXISTS eligible_for_regrading boolean NOT NULL DEFAULT FALSE;

UPDATE submissions
SET eligible_for_regrading = (graded_at IS NOT NULL) OR (grading_requested_at IS NOT NULL);
