ALTER TABLE assessment_questions
ADD COLUMN IF NOT EXISTS force_max_points BOOLEAN DEFAULT FALSE;
