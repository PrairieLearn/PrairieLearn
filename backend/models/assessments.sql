CREATE TABLE IF NOT EXISTS assessments (
    id SERIAL PRIMARY KEY,
    tid varchar(255),
    course_instance_id INTEGER NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    type enum_assessment_type,
    number varchar(20),
    title varchar(255),
    config JSONB,
    multiple_instance boolean,
    max_points DOUBLE PRECISION,
    assessment_set_id INTEGER REFERENCES assessment_sets ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    obj JSONB,
    UNIQUE (tid, course_instance_id)
);

ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_tid_key;

DO $$ 
    BEGIN
        ALTER TABLE assessments ADD COLUMN multiple_instance boolean;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$ 
    BEGIN
        ALTER TABLE assessments ADD COLUMN max_points DOUBLE PRECISION;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
