CREATE TABLE IF NOT EXISTS course_instances (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL,
    course_id INTEGER NOT NULL REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    short_name varchar(255),
    long_name varchar(255),
    number INTEGER,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (uuid, course_id)
);

DO $$ 
    BEGIN
        ALTER TABLE course_instances ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$ 
    BEGIN
        ALTER TABLE course_instances ADD COLUMN number INTEGER;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

ALTER TABLE 

ALTER TABLE course_instances DROP CONSTRAINT IF EXISTS course_instances_short_name_course_id_key;

ALTER TABLE ADD CONSTRAINT course_instances_uuid_course_id_key UNIQUE (uuid, course_id);
