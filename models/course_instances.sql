CREATE TABLE IF NOT EXISTS course_instances (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    short_name text,
    long_name text,
    number INTEGER,
    display_timezone text,
    deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE course_instances ADD COLUMN IF NOT EXISTS display_timezone text;
UPDATE course_instances SET display_timezone = 'America/Chicago' WHERE display_timezone IS NULL;
-- FIXME: make display_timezone NOT NULL in the future
