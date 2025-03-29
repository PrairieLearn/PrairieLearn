--add json_grade_rate_minutes column to assessments table
ALTER TABLE assessments
ADD COLUMN json_grade_rate_minutes DOUBLE PRECISION;
