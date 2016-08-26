CREATE TABLE IF NOT EXISTS tests (
    id SERIAL PRIMARY KEY,
    tid varchar(255),
    course_instance_id INTEGER NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    type enum_test_type,
    number varchar(20),
    title varchar(255),
    config JSONB,
    multiple_instance boolean,
    max_points DOUBLE PRECISION,
    test_set_id INTEGER REFERENCES test_sets ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    obj JSONB,
    UNIQUE (tid, course_instance_id)
);

ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_tid_key;

DO $$ 
    BEGIN
        ALTER TABLE tests ADD COLUMN multiple_instance boolean;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$ 
    BEGIN
        ALTER TABLE tests ADD COLUMN max_points DOUBLE PRECISION;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
