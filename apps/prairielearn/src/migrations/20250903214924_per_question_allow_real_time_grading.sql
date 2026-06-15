ALTER TABLE assessments
ADD COLUMN json_allow_real_time_grading BOOLEAN;

ALTER TABLE assessment_questions
ADD COLUMN allow_real_time_grading BOOLEAN;
