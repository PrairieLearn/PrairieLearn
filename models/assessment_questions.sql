CREATE TABLE IF NOT EXISTS assessment_questions (
    id SERIAL PRIMARY KEY,
    number INTEGER,
    max_points DOUBLE PRECISION,
    points_list DOUBLE PRECISION[],
    init_points DOUBLE PRECISION,
    assessment_id INTEGER NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    alternative_group_id INTEGER NOT NULL REFERENCES alternative_groups ON DELETE SET NULL ON UPDATE CASCADE,
    number_in_alternative_group INTEGER,
    question_id INTEGER NOT NULL REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (question_id, assessment_id)
);

DO $$
    BEGIN
        ALTER TABLE assessment_questions ADD COLUMN alternative_group_id INTEGER REFERENCES alternative_groups ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

ALTER TABLE assessment_questions DROP COLUMN IF EXISTS zone_id CASCADE;

-- FIXME: add a NOT NULL constraint to the alternative_group_id column

DO $$
    BEGIN
        ALTER TABLE assessment_questions ADD COLUMN number_in_alternative_group INTEGER;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
