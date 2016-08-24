CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    sid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE,
    variant_id INTEGER NOT NULL REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id INTEGER REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    submitted_answer JSONB,
    type enum_submission_type,
    override_score DOUBLE PRECISION,
    open BOOLEAN,
    credit INTEGER,
    mode enum_mode,
    graded_at TIMESTAMP WITH TIME ZONE,
    score DOUBLE PRECISION,
    correct BOOLEAN,
    feedback JSONB
);

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN variant_id INTEGER NOT NULL REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN graded_at TIMESTAMP WITH TIME ZONE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN score DOUBLE PRECISION;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN correct BOOLEAN;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN feedback JSONB;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
