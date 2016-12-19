DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_auth_action') THEN
        CREATE TYPE enum_auth_action AS ENUM ('View', 'Edit');
    END IF;
END;
$$;
