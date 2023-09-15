ALTER TABLE jobs
DROP COLUMN IF EXISTS number;

DROP INDEX IF EXISTS jobs_course_id_number_key;
