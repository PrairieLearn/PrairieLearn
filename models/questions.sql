CREATE TABLE IF NOT EXISTS questions (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE,
    qid varchar(255),
    directory varchar(255),
    type enum_question_type,
    title varchar(255),
    config JSONB,
    client_files TEXT[] DEFAULT ARRAY[]::TEXT[],
    number INTEGER,
    grading_method enum_grading_method NOT NULL DEFAULT 'Internal',
    course_id BIGINT NOT NULL REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    topic_id BIGINT REFERENCES topics ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (number, course_id)
);

-- FIXME: make NOT NULL after upgrade is done
ALTER TABLE questions ADD COLUMN IF NOT EXISTS uuid UUID UNIQUE;

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_qid_course_id_key;

ALTER TABLE questions ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE questions ALTER COLUMN course_id SET DATA TYPE BIGINT;
ALTER TABLE questions ALTER COLUMN topic_id SET DATA TYPE BIGINT;
