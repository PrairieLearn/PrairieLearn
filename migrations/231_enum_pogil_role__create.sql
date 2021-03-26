DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_pogile_role') THEN
        CREATE TYPE enum_pogil_role AS ENUM ('None', 'Manager', 'Recorder', 'Reflector', 'Contributor');
    END IF;
END;
$$;