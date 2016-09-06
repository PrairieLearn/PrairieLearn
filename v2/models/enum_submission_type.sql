DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_submission_type') THEN
        CREATE TYPE enum_submission_type AS ENUM ('check', 'score', 'practice');
    END IF;
END;
$$;
