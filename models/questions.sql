CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    uuid UUID,
    qid varchar(255),
    directory varchar(255),
    type enum_question_type,
    title varchar(255),
    config JSONB,
    client_files TEXT[] DEFAULT ARRAY[]::TEXT[],
    number INTEGER,
    grading_method enum_grading_method NOT NULL DEFAULT 'Internal',
    course_id INTEGER NOT NULL REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    topic_id INTEGER REFERENCES topics ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (qid, course_id),
    UNIQUE (number, course_id)
);

DO $$ 
    BEGIN
        ALTER TABLE questions ADD COLUMN directory varchar(255);
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$ 
    BEGIN
        ALTER TABLE questions ADD COLUMN number INTEGER;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$ 
    BEGIN
        ALTER TABLE questions ADD COLUMN grading_method enum_grading_method NOT NULL DEFAULT 'Internal';
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$ 
    BEGIN
        ALTER TABLE questions ADD COLUMN client_files TEXT[] DEFAULT ARRAY[]::TEXT[];
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
