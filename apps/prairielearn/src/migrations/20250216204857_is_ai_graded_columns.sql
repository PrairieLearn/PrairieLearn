ALTER TABLE instance_questions
ADD COLUMN IF NOT EXISTS is_ai_graded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS is_ai_graded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TYPE enum_grading_method
ADD VALUE 'AI';
