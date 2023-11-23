-- prairielearn:migrations NO TRANSACTION
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_sequences_course_request_id_idx ON job_sequences (course_request_id);
