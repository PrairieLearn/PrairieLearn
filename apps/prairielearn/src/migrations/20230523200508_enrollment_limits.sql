ALTER TABLE enrollments
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE;

-- We set the default as a separate step to avoid setting the value for all
-- existing rows.
ALTER TABLE enrollments
ALTER COLUMN created_at
SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE institutions
ADD COLUMN IF NOT EXISTS yearly_enrollment_limit INTEGER NOT NULL DEFAULT 100000;

ALTER TABLE institutions
ADD COLUMN IF NOT EXISTS course_instance_enrollment_limit INTEGER NOT NULL DEFAULT 10000;

ALTER TABLE course_instances
ADD COLUMN IF NOT EXISTS enrollment_limit INTEGER;
