DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_course_role') THEN
        CREATE TYPE enum_course_role AS ENUM ('Viewer', 'Editor', 'Owner');
    END IF;
END;
$$;
