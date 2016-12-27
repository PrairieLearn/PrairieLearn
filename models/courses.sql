CREATE TABLE IF NOT EXISTS courses (
    id BIGSERIAL PRIMARY KEY,
    short_name text UNIQUE,
    title text,
    grading_queue TEXT,
    path text
);

DO $$
    BEGIN
        ALTER TABLE courses ADD COLUMN grading_queue TEXT;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

ALTER TABLE courses ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE courses ALTER COLUMN short_name SET DATA TYPE TEXT;
ALTER TABLE courses ALTER COLUMN title SET DATA TYPE TEXT;
ALTER TABLE courses ALTER COLUMN path SET DATA TYPE TEXT;
