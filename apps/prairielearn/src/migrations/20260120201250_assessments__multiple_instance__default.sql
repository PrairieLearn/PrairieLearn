-- Add default value for multiple_instance
ALTER TABLE assessments
ALTER COLUMN multiple_instance
SET DEFAULT false;
