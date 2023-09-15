ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS course_instance_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'jobs_course_instance_id_fkey'
        )
        THEN
        ALTER TABLE jobs ADD FOREIGN KEY (course_instance_id) REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END;
$$;
