ALTER TABLE courses
ADD COLUMN IF NOT EXISTS pl_course_id bigint;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'courses_pl_course_id_fkey'
        )
        THEN
        ALTER TABLE courses ADD FOREIGN KEY (pl_course_id) REFERENCES pl_courses ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END;
$$;
