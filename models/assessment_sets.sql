CREATE TABLE IF NOT EXISTS assessment_sets (
    id BIGSERIAL PRIMARY KEY,
    abbreviation text,
    name text,
    heading text,
    color text,
    number INTEGER,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (name, course_id)
);

DO $$
BEGIN
    PERFORM 1 FROM information_schema.columns
    WHERE table_name = 'assessment_sets' AND column_name = 'abbrev';

    IF FOUND THEN
        ALTER TABLE assessment_sets RENAME COLUMN abbrev TO abbreviation;
    END IF;
END;
$$;

ALTER TABLE assessment_sets ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE assessment_sets ALTER COLUMN abbreviation SET DATA TYPE TEXT;
ALTER TABLE assessment_sets ALTER COLUMN course_id SET DATA TYPE BIGINT;
ALTER TABLE assessment_sets ALTER COLUMN name SET DATA TYPE TEXT;
ALTER TABLE assessment_sets ALTER COLUMN heading SET DATA TYPE TEXT;
ALTER TABLE assessment_sets ALTER COLUMN color SET DATA TYPE TEXT;
