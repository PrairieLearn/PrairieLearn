ALTER TABLE assessment_questions
ADD CONSTRAINT assessment_questions_allow_real_time_grading_not_null CHECK (allow_real_time_grading IS NOT NULL) NOT VALID;
