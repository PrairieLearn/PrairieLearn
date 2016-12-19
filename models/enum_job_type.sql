DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_job_type') THEN
        CREATE TYPE enum_job_type AS ENUM ('Sync');
    END IF;
END;
$$;
