CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    qid varchar(255),
    type enum_question_type,
    title varchar(255),
    config JSONB,
    course_id INTEGER REFERENCES courses,
    topic_id INTEGER REFERENCES topics,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (qid, course_id)
);
