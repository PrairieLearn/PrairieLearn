ALTER TABLE assessment_questions
ADD COLUMN IF NOT EXISTS ai_grading_model TEXT;
