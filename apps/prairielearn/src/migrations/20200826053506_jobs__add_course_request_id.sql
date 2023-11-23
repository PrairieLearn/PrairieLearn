ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS course_request_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'jobs_course_request_id_fkey'
        )
        THEN
        ALTER TABLE jobs ADD FOREIGN KEY (course_request_id) REFERENCES course_requests ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END;
$$;

ALTER TABLE job_sequences
ADD COLUMN IF NOT EXISTS course_request_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'job_sequences_course_request_id_fkey'
        )
        THEN
        ALTER TABLE job_sequences ADD FOREIGN KEY (course_request_id) REFERENCES course_requests ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END;
$$;
