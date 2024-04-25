ALTER TABLE questions
ADD COLUMN IF NOT EXISTS external_grading_enable_networking BOOLEAN;
