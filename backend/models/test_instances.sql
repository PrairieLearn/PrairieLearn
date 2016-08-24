CREATE TABLE IF NOT EXISTS test_instances (
    id SERIAL PRIMARY KEY,
    tiid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    qids JSONB, -- temporary, delete after Mongo import
    obj JSONB, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE,
    number INTEGER,
    open BOOLEAN,
    test_id INTEGER NOT NULL REFERENCES tests ON DELETE CASCADE ON UPDATE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id INTEGER REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    points DOUBLE PRECISION,
    max_points DOUBLE PRECISION,
    score_perc INTEGER,
    UNIQUE (number, test_id, user_id)
);

ALTER TABLE test_instances ALTER COLUMN auth_user_id DROP NOT NULL;

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN points DOUBLE PRECISION;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN max_points DOUBLE PRECISION;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE submissions ADD COLUMN score_perc INTEGER;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
