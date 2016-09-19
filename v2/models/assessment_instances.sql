CREATE TABLE IF NOT EXISTS assessment_instances (
    id SERIAL PRIMARY KEY,
    tiid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    qids JSONB, -- temporary, delete after Mongo import
    obj JSONB, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    mode enum_mode, -- mode at creation
    number INTEGER,
    open BOOLEAN DEFAULT TRUE,
    closed_at TIMESTAMP WITH TIME ZONE,
    duration INTERVAL DEFAULT INTERVAL '0 seconds',
    assessment_id INTEGER NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id INTEGER REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    points DOUBLE PRECISION DEFAULT 0,
    max_points DOUBLE PRECISION,
    score_perc INTEGER DEFAULT 0,
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

ALTER TABLE assessment_instances ALTER COLUMN open SET DEFAULT TRUE;

DO $$
    BEGIN
        ALTER TABLE assessment_instances ADD COLUMN closed_at TIMESTAMP WITH TIME ZONE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE assessment_instances ADD COLUMN mode enum_mode;

        UPDATE assessment_instances AS ai
        SET mode = CASE WHEN a.type = 'Exam' THEN 'Exam'::enum_mode ELSE 'Public'::enum_mode END
        FROM assessments AS a
        WHERE ai.assessment_id = a.id AND ai.mode IS NULL;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE assessment_instances ADD COLUMN duration INTERVAL DEFAULT INTERVAL '0 seconds';
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
