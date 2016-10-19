DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_grading_type') THEN
        CREATE TYPE enum_grading_type AS ENUM ('Internal', 'External', 'Manual');
    END IF;
END;
$$;
