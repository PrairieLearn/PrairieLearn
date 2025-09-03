-- Recreate enrollment_code with UNIQUE constraint
-- Note: This will drop existing values in enrollment_code. If you need to backfill,
-- run an update prior to this migration to preserve values or regenerate afterwards.

ALTER TABLE course_instances
DROP COLUMN IF EXISTS enrollment_code;

ALTER TABLE course_instances
ADD COLUMN enrollment_code VARCHAR(255);

ALTER TABLE course_instances
ADD CONSTRAINT course_instances_enrollment_code_key UNIQUE (enrollment_code);


