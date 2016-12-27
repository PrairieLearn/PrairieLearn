CREATE TABLE IF NOT EXISTS assessment_sets (
    id BIGSERIAL PRIMARY KEY,
    abbrev varchar(255),
    name varchar(255),
    heading varchar(255),
    color varchar(255),
    number INTEGER,
    course_id BIGINT NOT NULL REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (name, course_id)
);

ALTER TABLE assessment_sets ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE assessment_sets ALTER COLUMN course_id SET DATA TYPE BIGINT;
