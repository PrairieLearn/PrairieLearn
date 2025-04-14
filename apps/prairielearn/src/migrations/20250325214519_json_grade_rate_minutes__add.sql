ALTER TABLE assessments
ADD COLUMN json_grade_rate_minutes DOUBLE PRECISION;

ALTER TABLE zones
ADD COLUMN json_grade_rate_minutes DOUBLE PRECISION;

ALTER TABLE alternative_groups
ADD COLUMN json_grade_rate_minutes DOUBLE PRECISION;

ALTER TABLE assessment_questions
ADD COLUMN json_grade_rate_minutes DOUBLE PRECISION;
