CREATE TABLE IF NOT EXISTS assessment_instances (
    id SERIAL PRIMARY KEY,
    tiid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    qids JSONB, -- temporary, delete after Mongo import
    obj JSONB, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE,
    number INTEGER,
    open BOOLEAN,
    assessment_id INTEGER NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id INTEGER REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    points DOUBLE PRECISION,
    max_points DOUBLE PRECISION,
    score_perc INTEGER,
    UNIQUE (number, assessment_id, user_id)
);

ALTER TABLE assessment_instances ALTER COLUMN auth_user_id DROP NOT NULL;

DO $$
    BEGIN
        ALTER TABLE assessment_instances ADD COLUMN points DOUBLE PRECISION;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE assessment_instances ADD COLUMN max_points DOUBLE PRECISION;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE assessment_instances ADD COLUMN score_perc INTEGER;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
