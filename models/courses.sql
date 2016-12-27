CREATE TABLE IF NOT EXISTS courses (
    id BIGSERIAL PRIMARY KEY,
    short_name varchar(255) UNIQUE,
    title varchar(255),
    grading_queue TEXT,
    path varchar(255)
);

DO $$
    BEGIN
        ALTER TABLE courses ADD COLUMN grading_queue TEXT;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

ALTER TABLE courses ALTER COLUMN id SET DATA TYPE BIGINT;
