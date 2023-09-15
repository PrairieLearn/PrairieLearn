ALTER TABLE assessment_sets
DROP CONSTRAINT IF EXISTS assessment_sets_name_course_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'assessment_sets_course_id_name_key'
        )
        THEN
        ALTER TABLE assessment_sets ADD UNIQUE (course_id, name);
    END IF;
END;
$$;
