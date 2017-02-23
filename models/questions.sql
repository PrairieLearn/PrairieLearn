CREATE TABLE IF NOT EXISTS questions (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE,
    qid text,
    directory text,
    template_directory text,
    type enum_question_type,
    title text,
    options JSONB,
    client_files TEXT[] DEFAULT ARRAY[]::TEXT[],
    number INTEGER,
    grading_method enum_grading_method NOT NULL DEFAULT 'Internal',
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    topic_id BIGINT REFERENCES topics ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (course_id, number)
);

CREATE INDEX IF NOT EXISTS questions_topic_id_idx ON questions (topic_id);

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_number_course_id_key;

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
$$
