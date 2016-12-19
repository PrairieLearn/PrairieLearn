CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    title varchar(255),
    number INTEGER,
    number_choose INTEGER, -- NULL means choose all
    assessment_id INTEGER NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (number, assessment_id)
);

DO $$
    BEGIN
        ALTER TABLE zones ADD COLUMN number_choose INTEGER;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
