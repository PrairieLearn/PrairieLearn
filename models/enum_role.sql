DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_role') THEN
        CREATE TYPE enum_role AS ENUM ('None', 'Student', 'TA', 'Instructor', 'Superuser');
    END IF;
END;
$$;

