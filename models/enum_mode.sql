DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_mode') THEN
        CREATE TYPE enum_mode AS ENUM ('Public', 'Exam');
    END IF;
END;
$$;
