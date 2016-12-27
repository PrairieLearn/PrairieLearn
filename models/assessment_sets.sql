CREATE TABLE IF NOT EXISTS assessment_sets (
    id BIGSERIAL PRIMARY KEY,
    abbrev text,
    name text,
    heading text,
    color text,
    number INTEGER,
    course_id BIGINT NOT NULL REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (name, course_id)
);

ALTER TABLE assessment_sets ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE assessment_sets ALTER COLUMN course_id SET DATA TYPE BIGINT;
ALTER TABLE assessment_sets ALTER COLUMN abbrev SET DATA TYPE TEXT;
ALTER TABLE assessment_sets ALTER COLUMN name SET DATA TYPE TEXT;
ALTER TABLE assessment_sets ALTER COLUMN heading SET DATA TYPE TEXT;
ALTER TABLE assessment_sets ALTER COLUMN color SET DATA TYPE TEXT;
