ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS regradable boolean DEFAULT FALSE;

UPDATE submissions
SET
  regradable = (graded_at IS NOT NULL)
  OR (grading_requested_at IS NOT NULL);
