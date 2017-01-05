CREATE TABLE IF NOT EXISTS courses (
    id BIGSERIAL PRIMARY KEY,
    short_name text,
    title text,
    grading_queue text,
    path text,
    repository text,
    deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS repository text;

ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_short_name_key;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE courses ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE courses ALTER COLUMN short_name SET DATA TYPE TEXT;
ALTER TABLE courses ALTER COLUMN title SET DATA TYPE TEXT;
ALTER TABLE courses ALTER COLUMN path SET DATA TYPE TEXT;
