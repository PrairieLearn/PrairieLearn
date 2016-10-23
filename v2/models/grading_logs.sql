CREATE TABLE IF NOT EXISTS grading_logs (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    submission_id INTEGER NOT NULL REFERENCES submissions ON DELETE CASCADE ON UPDATE CASCADE,
    external_grading_started_at TIMESTAMP WITH TIME ZONE,
    score DOUBLE PRECISION,
    correct BOOLEAN,
    feedback JSONB,
    auth_user_id INTEGER REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE grading_logs ALTER COLUMN date SET DEFAULT CURRENT_TIMESTAMP;

DO $$
    BEGIN
        ALTER TABLE grading_logs ADD COLUMN correct BOOLEAN;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE grading_logs ADD COLUMN external_grading_started_at TIMESTAMP WITH TIME ZONE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
