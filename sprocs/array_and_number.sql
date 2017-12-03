--create types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'array_and_number') THEN
        CREATE TYPE array_and_number AS (arr DOUBLE PRECISION[], number INTEGER);
    END IF;
END$$;
