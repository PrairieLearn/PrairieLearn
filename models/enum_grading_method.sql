DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_grading_method') THEN
        CREATE TYPE enum_grading_method AS ENUM ('Internal', 'External', 'Manual', 'Autograded');
    END IF;
END;
$$;
