ALTER TABLE grading_jobs
-- This is a false positive (https://github.com/sbdchd/squawk/issues/647)
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN deleted_by BIGINT REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE;
