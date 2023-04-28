ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS assessment_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'jobs_assessment_id_fkey'
        )
        THEN
        ALTER TABLE jobs ADD FOREIGN KEY (assessment_id) REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END;
$$;
