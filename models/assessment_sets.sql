CREATE TABLE IF NOT EXISTS assessment_sets (
    id BIGSERIAL PRIMARY KEY,
    abbreviation text,
    name text,
    heading text,
    color text,
    number INTEGER,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (course_id, name)
);
