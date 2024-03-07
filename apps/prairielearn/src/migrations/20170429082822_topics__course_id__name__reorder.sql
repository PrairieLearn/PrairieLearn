ALTER TABLE topics
DROP CONSTRAINT IF EXISTS topics_name_course_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'topics_course_id_name_key'
        )
        THEN
        ALTER TABLE topics ADD UNIQUE (course_id, name);
    END IF;
END;
$$;
