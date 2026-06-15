ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS grading_method enum_grading_method;
