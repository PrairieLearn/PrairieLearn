DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_job_status') THEN
        CREATE TYPE enum_job_status AS ENUM ('Running', 'Success', 'Error');
    END IF;
END;
$$;
