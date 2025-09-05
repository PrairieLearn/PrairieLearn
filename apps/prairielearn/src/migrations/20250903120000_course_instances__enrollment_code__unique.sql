-- Since we aren't yet using enrollment codes in production, 
-- we can safely drop the column and add it back with a UNIQUE constraint.
ALTER TABLE course_instances
DROP COLUMN IF EXISTS enrollment_code;

ALTER TABLE course_instances
ADD COLUMN enrollment_code VARCHAR(255) UNIQUE;
