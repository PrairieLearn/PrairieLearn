ALTER TABLE tags
DROP CONSTRAINT IF EXISTS tags_name_course_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'tags_course_id_name_key'
        )
        THEN
        ALTER TABLE tags ADD UNIQUE (course_id, name);
    END IF;
END;
$$;
