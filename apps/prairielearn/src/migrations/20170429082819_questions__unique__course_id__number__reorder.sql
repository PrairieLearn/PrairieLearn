ALTER TABLE questions
DROP CONSTRAINT IF EXISTS questions_number_course_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'questions_course_id_number_key'
        )
        THEN
        ALTER TABLE questions ADD UNIQUE (course_id, number);
    END IF;
END;
$$;
