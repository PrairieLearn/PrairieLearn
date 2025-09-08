ALTER TABLE assessments
ADD COLUMN IF NOT EXISTS json_allow_real_time_grading BOOLEAN;

ALTER TABLE assessment_questions
ADD COLUMN IF NOT EXISTS allow_real_time_grading BOOLEAN;
