CREATE TABLE IF NOT EXISTS grading_logs (
    id BIGSERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    submission_id BIGINT NOT NULL REFERENCES submissions ON DELETE CASCADE ON UPDATE CASCADE,
    grading_method enum_grading_method,
    grading_requested_at TIMESTAMP WITH TIME ZONE,
    grading_request_canceled_at TIMESTAMP WITH TIME ZONE,
    grading_request_canceled_by BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    graded_at TIMESTAMP WITH TIME ZONE,
    graded_by BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    score DOUBLE PRECISION,
    correct BOOLEAN,
    feedback JSONB,
    auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
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
        ALTER TABLE grading_logs ADD COLUMN grading_requested_at TIMESTAMP WITH TIME ZONE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE grading_logs ADD COLUMN grading_request_canceled_at TIMESTAMP WITH TIME ZONE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE grading_logs ADD COLUMN grading_request_canceled_by BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE grading_logs ADD COLUMN graded_at TIMESTAMP WITH TIME ZONE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE grading_logs ADD COLUMN graded_by BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE grading_logs ADD COLUMN grading_method enum_grading_method;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

ALTER TABLE grading_logs ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE grading_logs ALTER COLUMN submission_id SET DATA TYPE BIGINT;
ALTER TABLE grading_logs ALTER COLUMN auth_user_id SET DATA TYPE BIGINT;
ALTER TABLE grading_logs ALTER COLUMN grading_request_canceled_by SET DATA TYPE BIGINT;
ALTER TABLE grading_logs ALTER COLUMN graded_by SET DATA TYPE BIGINT;
