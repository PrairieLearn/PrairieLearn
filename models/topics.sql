CREATE TABLE IF NOT EXISTS topics (
    id BIGSERIAL PRIMARY KEY,
    name text,
    number INTEGER,
    color text,
    description text,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (course_id, name)
);

ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_name_course_id_key;

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
$$
