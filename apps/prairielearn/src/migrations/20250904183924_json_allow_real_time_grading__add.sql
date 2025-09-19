ALTER TABLE zones
ADD COLUMN json_allow_real_time_grading BOOLEAN;

ALTER TABLE alternative_groups
ADD COLUMN json_allow_real_time_grading BOOLEAN;

ALTER TABLE assessment_questions
ADD COLUMN json_allow_real_time_grading BOOLEAN;
