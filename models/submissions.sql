CREATE TABLE IF NOT EXISTS submissions (
    id BIGSERIAL PRIMARY KEY,
    sid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    variant_id BIGINT NOT NULL REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    submitted_answer JSONB,
    type enum_submission_type,
    override_score DOUBLE PRECISION,
    credit INTEGER,
    mode enum_mode,
    grading_requested_at TIMESTAMP WITH TIME ZONE,
    graded_at TIMESTAMP WITH TIME ZONE,
    score DOUBLE PRECISION,
    correct BOOLEAN,
    feedback JSONB
);

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN variant_id BIGINT NOT NULL REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE;
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

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN grading_requested_at TIMESTAMP WITH TIME ZONE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

ALTER TABLE submissions ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE submissions ALTER COLUMN variant_id SET DATA TYPE BIGINT;
ALTER TABLE submissions ALTER COLUMN auth_user_id SET DATA TYPE BIGINT;
