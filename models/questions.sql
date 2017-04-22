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
    external_grading_enabled BOOLEAN DEFAULT FALSE,
    external_grading_image text,
    external_grading_files TEXT[] DEFAULT ARRAY[]::TEXT[],
    external_grading_entrypoint text,
    UNIQUE (course_id, number)
);

CREATE INDEX IF NOT EXISTS questions_topic_id_idx ON questions (topic_id);
