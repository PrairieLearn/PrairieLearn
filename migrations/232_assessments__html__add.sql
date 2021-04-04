-- Stores the contents of `assessment.html` if it exists.
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS html text;
