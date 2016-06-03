CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    qid varchar(255),
    type enum_question_type,
    title varchar(255),
    config JSONB,
    course_id INTEGER NOT NULL REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES topics ON DELETE CASCADE ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (qid, course_id)
);
